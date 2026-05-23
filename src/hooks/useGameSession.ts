/**
 * 把游戏会话相关的所有 React state、副作用、auth bootstrap、localStorage 同步收敛到一个 hook。
 * App.tsx 只负责消费它返回的 { snapshot, isBusy, statusMessage, errorMessage, ..., actions }。
 *
 * 关键设计：
 * - localStorage key 按 userId 隔离（`wpc.${userId}.activeGameId`），登出 / 切账号自动失效。
 * - auth state 监听：onAuthStateChange 在 SIGNED_OUT 时清当前用户的 storage 并重置 snapshot。
 * - 错误统一收口：runGameAction 是唯一 try/catch；NEEDS_LOGIN 触发 needsLogin。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameSnapshot, MetricChanges } from '../contracts/game';
import {
  ApiClientError,
  createGame,
  getGameState,
  getSupabaseClient,
} from '../lib/apiClient';
import {
  advanceGame,
  submitProposalAction,
  type OrchestratorDeps,
} from '../lib/gameOrchestrator';

const PLAYTEST_EMAIL = import.meta.env.VITE_PLAYTEST_EMAIL ?? 'playtest@example.com';
const PLAYTEST_PASSWORD = import.meta.env.VITE_PLAYTEST_PASSWORD ?? '';

/** 模块级 promise，避免 StrictMode 双调用产生两局新游戏。 */
let pendingInitialGame: Promise<GameSnapshot> | null = null;

type RoundMeta = {
  briefing?: string;
  priorityIssue?: string;
  roundNumber: number;
};

export type UseGameSessionResult = {
  snapshot: GameSnapshot | null;
  roundMeta: RoundMeta | null;
  lastMetricChanges: MetricChanges | null;
  isBusy: boolean;
  statusMessage: string;
  errorMessage: string;
  needsLogin: boolean;
  actions: {
    startNewGame: () => void;
    advance: () => void;
    submitProposal: (proposal: string) => void;
    onLoginSuccess: () => void;
  };
};

function activeGameKey(userId: string | null): string {
  return userId ? `wpc.${userId}.activeGameId` : 'wpc.anon.activeGameId';
}

function metricChangesKey(userId: string | null): string {
  return userId ? `wpc.${userId}.lastMetricChanges` : 'wpc.anon.lastMetricChanges';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStoredMetricChanges(userId: string | null, gameId: string): MetricChanges | null {
  const raw = localStorage.getItem(metricChangesKey(userId));
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.gameId !== gameId || !isRecord(parsed.metricChanges)) {
      return null;
    }
    const m = parsed.metricChanges;
    return {
      globalTension: typeof m.globalTension === 'number' ? m.globalTension : undefined,
      worldStability: typeof m.worldStability === 'number' ? m.worldStability : undefined,
      aiRisk: typeof m.aiRisk === 'number' ? m.aiRisk : undefined,
      economicPressure: typeof m.economicPressure === 'number' ? m.economicPressure : undefined,
      humanitarianCrisis: typeof m.humanitarianCrisis === 'number' ? m.humanitarianCrisis : undefined,
      peaceAgreement: typeof m.peaceAgreement === 'number' ? m.peaceAgreement : undefined,
    };
  } catch {
    return null;
  }
}

function storeMetricChanges(userId: string | null, gameId: string, metricChanges: MetricChanges): void {
  localStorage.setItem(metricChangesKey(userId), JSON.stringify({ gameId, metricChanges }));
}

function clearUserStorage(userId: string | null): void {
  localStorage.removeItem(activeGameKey(userId));
  localStorage.removeItem(metricChangesKey(userId));
}

function getSupabaseHostHint(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  if (typeof supabaseUrl !== 'string') {
    return 'Supabase 项目域名';
  }

  try {
    return new URL(supabaseUrl).host;
  } catch {
    return 'Supabase 项目域名';
  }
}

function collectErrorMessages(error: unknown): string[] {
  const messages: string[] = [];

  function visit(value: unknown, depth: number): void {
    if (depth > 3 || value === null || value === undefined) return;

    if (typeof value === 'string') {
      messages.push(value);
      return;
    }

    if (value instanceof Error) {
      messages.push(value.message);
      const errorWithDetails = value as { cause?: unknown; details?: unknown; error?: unknown };
      visit(errorWithDetails.cause, depth + 1);
      visit(errorWithDetails.details, depth + 1);
      visit(errorWithDetails.error, depth + 1);
      return;
    }

    if (!isRecord(value)) return;

    for (const key of ['message', 'error', 'details', 'cause']) {
      visit(value[key], depth + 1);
    }
  }

  visit(error, 0);
  return messages;
}

function isFetchNetworkError(error: unknown): boolean {
  return collectErrorMessages(error).some((message) =>
    /failed to fetch|fetch failed|networkerror|load failed|err_blocked_by_client/i.test(message),
  );
}

function getCloudConnectionErrorMessage(): string {
  return `无法连接云端 Supabase（${getSupabaseHostHint()}）。请检查网络或代理设置，并在浏览器扩展、广告拦截器、内容拦截器中允许该域名后重试。`;
}

function getErrorMessage(error: unknown): string {
  if (isFetchNetworkError(error)) {
    return getCloudConnectionErrorMessage();
  }

  if (error instanceof ApiClientError) {
    return `${error.message}（${error.code}）`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return '发生未知错误。';
}

async function ensurePlaytestSession(): Promise<void> {
  if (!PLAYTEST_PASSWORD) {
    return;
  }

  const supabase = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(`读取登录状态失败：${sessionError.message}`);
  }
  if (sessionData.session) {
    return;
  }

  if (!import.meta.env.DEV) {
    throw new ApiClientError('NEEDS_LOGIN', '请先登录后再开始游戏。', 401);
  }

  const signIn = await supabase.auth.signInWithPassword({ email: PLAYTEST_EMAIL, password: PLAYTEST_PASSWORD });
  if (!signIn.error && signIn.data.session) {
    return;
  }

  const signUp = await supabase.auth.signUp({
    email: PLAYTEST_EMAIL,
    password: PLAYTEST_PASSWORD,
    options: { data: { display_name: '首席秩序架构师' } },
  });
  if (signUp.error && !signUp.error.message.toLowerCase().includes('already')) {
    throw new Error(`创建测试用户失败：${signUp.error.message}`);
  }
  if (signUp.data.session) {
    return;
  }

  const retry = await supabase.auth.signInWithPassword({ email: PLAYTEST_EMAIL, password: PLAYTEST_PASSWORD });
  if (retry.error || !retry.data.session) {
    throw new Error('测试用户未能登录。请确认云端 Supabase Auth 已启用邮箱密码登录。');
  }
}

function createInitialGameOnce(): Promise<GameSnapshot> {
  if (!pendingInitialGame) {
    pendingInitialGame = createGame().catch((error: unknown) => {
      pendingInitialGame = null;
      throw error;
    });
  }
  return pendingInitialGame;
}

export function useGameSession(): UseGameSessionResult {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [lastMetricChanges, setLastMetricChanges] = useState<MetricChanges | null>(null);
  const [roundMeta, setRoundMeta] = useState<RoundMeta | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState('正在连接云端 Supabase...');
  const [errorMessage, setErrorMessage] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const userIdRef = useRef<string | null>(null);
  const bootstrappedRef = useRef(false);

  const rememberMetricChanges = useCallback(
    (gameId: string, metricChanges: MetricChanges | null | undefined) => {
      if (!metricChanges) return;
      setLastMetricChanges(metricChanges);
      storeMetricChanges(userIdRef.current, gameId, metricChanges);
    },
    [],
  );

  const buildOrchestratorDeps = useCallback((): OrchestratorDeps => ({
    setSnapshot,
    setStatusMessage,
    setRoundMeta,
    rememberMetricChanges,
    resetSelectedLocation: () => {
      // selectedLocation 由 App 管理，这里没有引用；保留 hook 形参兼容 orchestrator 的接口。
      // App 会在 snapshot 切换时通过 useEffect 自行清理。
    },
  }), [rememberMetricChanges]);

  const runGameAction = useCallback(
    async (message: string, action: () => Promise<void>) => {
      setIsBusy(true);
      setStatusMessage(message);
      setErrorMessage('');
      try {
        await ensurePlaytestSession();
        await action();
      } catch (error) {
        if (error instanceof ApiClientError && error.code === 'NEEDS_LOGIN') {
          setNeedsLogin(true);
          setStatusMessage('请先登录后再开始游戏。');
        } else {
          setErrorMessage(getErrorMessage(error));
        }
      } finally {
        setIsBusy(false);
      }
    },
    [],
  );

  const loadOrCreateGame = useCallback(async () => {
    const userId = userIdRef.current;
    const savedGameId = localStorage.getItem(activeGameKey(userId));

    if (savedGameId) {
      try {
        const saved = await getGameState(savedGameId);
        setSnapshot(saved);
        setLastMetricChanges(saved.settlement?.metricChanges ?? readStoredMetricChanges(userId, saved.game.id));
        setStatusMessage(`已恢复第 ${saved.game.currentRound} 回合。`);
        return;
      } catch (error) {
        localStorage.removeItem(activeGameKey(userId));
        console.warn('恢复已保存游戏失败，将创建新游戏。', error);
      }
    }

    const created = await createInitialGameOnce();
    setSnapshot(created);
    setLastMetricChanges(null);
    setRoundMeta(null);
    localStorage.setItem(activeGameKey(userId), created.game.id);
    setStatusMessage('已创建第 1 回合，请生成本回合随机事件。');
  }, []);

  // bootstrap：首次加载尝试 ensurePlaytestSession + loadOrCreateGame
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void runGameAction('正在连接云端 Supabase...', loadOrCreateGame);
  }, [loadOrCreateGame, runGameAction]);

  // 监听 auth：登入后记录 userId、登出时清当前用户的 localStorage 和 snapshot
  useEffect(() => {
    const supabase = getSupabaseClient();
    void supabase.auth.getSession().then(({ data }) => {
      userIdRef.current = data.session?.user?.id ?? null;
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      const previousUserId = userIdRef.current;
      const nextUserId = session?.user?.id ?? null;

      if (event === 'SIGNED_OUT' || (previousUserId && previousUserId !== nextUserId)) {
        clearUserStorage(previousUserId);
        setSnapshot(null);
        setLastMetricChanges(null);
        setRoundMeta(null);
        bootstrappedRef.current = false;
      }

      userIdRef.current = nextUserId;
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  const startNewGame = useCallback(() => {
    void runGameAction('正在创建新游戏...', async () => {
      const created = await createGame();
      setSnapshot(created);
      setLastMetricChanges(null);
      setRoundMeta(null);
      localStorage.setItem(activeGameKey(userIdRef.current), created.game.id);
      setStatusMessage('已创建新游戏，请生成第 1 回合随机事件。');
    });
  }, [runGameAction]);

  const advance = useCallback(() => {
    void runGameAction('正在同步阶段...', async () => {
      if (!snapshot) {
        await loadOrCreateGame();
        return;
      }
      await advanceGame(snapshot, buildOrchestratorDeps());
    });
  }, [buildOrchestratorDeps, loadOrCreateGame, runGameAction, snapshot]);

  const submitProposalCallback = useCallback(
    (proposal: string) => {
      void runGameAction('正在提交提案并等待 AI 裁定...', async () => {
        if (!snapshot) {
          throw new Error('请先创建游戏。');
        }
        await submitProposalAction(snapshot, proposal, buildOrchestratorDeps());
      });
    },
    [buildOrchestratorDeps, runGameAction, snapshot],
  );

  const onLoginSuccess = useCallback(() => {
    setNeedsLogin(false);
    bootstrappedRef.current = false;
    void runGameAction('正在连接云端 Supabase...', loadOrCreateGame);
  }, [loadOrCreateGame, runGameAction]);

  return {
    snapshot,
    roundMeta,
    lastMetricChanges,
    isBusy,
    statusMessage,
    errorMessage,
    needsLogin,
    actions: {
      startNewGame,
      advance,
      submitProposal: submitProposalCallback,
      onLoginSuccess,
    },
  };
}
