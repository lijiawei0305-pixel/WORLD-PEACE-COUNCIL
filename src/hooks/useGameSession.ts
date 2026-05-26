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
import { useLanguage } from '../lib/i18n';

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
    signOut: () => void;
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

function clearSavedGamePointers(userId: string | null): void {
  clearUserStorage(userId);
  clearUserStorage(null);
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

async function getCurrentSessionUserId(): Promise<string | null> {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) {
    throw new Error(`读取登录状态失败：${error.message}`);
  }
  return data.session?.user.id ?? null;
}

async function ensurePlaytestSession(): Promise<string | null> {
  if (!PLAYTEST_PASSWORD) {
    return getCurrentSessionUserId();
  }

  const supabase = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(`读取登录状态失败：${sessionError.message}`);
  }
  if (sessionData.session) {
    return sessionData.session.user.id;
  }

  if (!import.meta.env.DEV) {
    throw new ApiClientError('NEEDS_LOGIN', '请先登录后再开始游戏。', 401);
  }

  const signIn = await supabase.auth.signInWithPassword({ email: PLAYTEST_EMAIL, password: PLAYTEST_PASSWORD });
  if (!signIn.error && signIn.data.session) {
    return signIn.data.session.user.id;
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
    return signUp.data.session.user.id;
  }

  const retry = await supabase.auth.signInWithPassword({ email: PLAYTEST_EMAIL, password: PLAYTEST_PASSWORD });
  if (retry.error || !retry.data.session) {
    throw new Error('测试用户未能登录。请确认云端 Supabase Auth 已启用邮箱密码登录。');
  }
  return retry.data.session.user.id;
}

function createInitialGameOnce(): Promise<GameSnapshot> {
  if (!pendingInitialGame) {
    pendingInitialGame = createGame().finally(() => {
      pendingInitialGame = null;
    });
  }
  return pendingInitialGame;
}

export function useGameSession(): UseGameSessionResult {
  const { language } = useLanguage();
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [lastMetricChanges, setLastMetricChanges] = useState<MetricChanges | null>(null);
  const [roundMeta, setRoundMeta] = useState<RoundMeta | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    language === 'en' ? 'Connecting to cloud Supabase...' : '正在连接云端 Supabase...',
  );
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
    language,
    uiText: {
      generatedEvents: (count) => language === 'en'
        ? `Generated ${count} random events. Move to the situation overview.`
        : `已生成 ${count} 个随机事件，请进入局势总览。`,
      enteredOverview: language === 'en' ? 'Entered the situation overview.' : '已进入局势总览。',
      enteredProposal: language === 'en' ? 'Entered the diplomatic proposal stage.' : '已进入外交提案阶段。',
      proposalRequired: language === 'en' ? 'Submit a diplomatic proposal first.' : '当前阶段需要先提交外交提案。',
      settlementComplete: language === 'en' ? 'Round settlement complete. You can start the next round.' : '回合结算完成，可以进入下一回合。',
      gameEnded: (status) => language === 'en' ? `Game ended: ${status}` : `游戏已结束：${status}`,
      gameAlreadyEnded: language === 'en' ? 'The game has ended. Create a new game.' : '游戏已经结束，请创建新游戏。',
      maxRoundsReached: language === 'en' ? 'Maximum rounds reached. You cannot continue.' : '已到达最大回合数，不能继续推进。',
      enteredRound: (round) => language === 'en'
        ? `Entered Round ${round}. Generate random events.`
        : `已进入第 ${round} 回合，请生成随机事件。`,
      submitOnlyProposalStage: language === 'en' ? 'You can only submit during the proposal stage.' : '只有外交提案阶段可以提交提案。',
      aiRulingComplete: (summary) => language === 'en' ? `AI ruling complete: ${summary}` : `AI 裁定完成：${summary}`,
    },
  }), [rememberMetricChanges, language]);

  const runGameAction = useCallback(
    async (message: string, action: () => Promise<void>) => {
      setIsBusy(true);
      setStatusMessage(message);
      setErrorMessage('');
      try {
        userIdRef.current = await ensurePlaytestSession();
        await action();
      } catch (error) {
        if (error instanceof ApiClientError && error.code === 'NEEDS_LOGIN') {
          setNeedsLogin(true);
          setStatusMessage(language === 'en' ? 'Sign in before starting the game.' : '请先登录后再开始游戏。');
        } else if (
          error instanceof ApiClientError &&
          ['FORBIDDEN', 'GAME_NOT_FOUND'].includes(error.code)
        ) {
          clearSavedGamePointers(userIdRef.current);
          setSnapshot(null);
          setLastMetricChanges(null);
          setRoundMeta(null);
          setStatusMessage(
            language === 'en'
              ? 'The saved game does not belong to this account. It was cleared; connect again to create a new game.'
              : '这局旧存档不属于当前账号，已清除本地指针；请重新连接以创建新游戏。',
          );
          setErrorMessage('');
        } else if (error instanceof Error && error.message === 'PROPOSAL_STAGE_SUBMIT_REQUIRED') {
          setErrorMessage(language === 'en' ? 'Submit a diplomatic proposal first.' : '当前阶段需要先提交外交提案。');
        } else if (error instanceof Error && error.message === 'SUBMIT_ONLY_PROPOSAL_STAGE') {
          setErrorMessage(language === 'en' ? 'You can only submit during the proposal stage.' : '只有外交提案阶段可以提交提案。');
        } else {
          setErrorMessage(getErrorMessage(error));
        }
      } finally {
        setIsBusy(false);
      }
    },
    [language],
  );

  const loadOrCreateGame = useCallback(async () => {
    const userId = await getCurrentSessionUserId();
    userIdRef.current = userId;
    const savedGameId = localStorage.getItem(activeGameKey(userId));

    if (savedGameId) {
      try {
        const saved = await getGameState(savedGameId);
        setSnapshot(saved);
        setLastMetricChanges(saved.settlement?.metricChanges ?? readStoredMetricChanges(userId, saved.game.id));
        setStatusMessage(language === 'en' ? `Restored Round ${saved.game.currentRound}.` : `已恢复第 ${saved.game.currentRound} 回合。`);
        return;
      } catch (error) {
        clearSavedGamePointers(userId);
        console.warn('恢复已保存游戏失败，将创建新游戏。', error);
      }
    }

    const created = await createInitialGameOnce();
    setSnapshot(created);
    setLastMetricChanges(null);
    setRoundMeta(null);
    localStorage.setItem(activeGameKey(userId), created.game.id);
    setStatusMessage(language === 'en' ? 'Created Round 1. Generate random events for this round.' : '已创建第 1 回合，请生成本回合随机事件。');
  }, [language]);

  // bootstrap：首次加载尝试 ensurePlaytestSession + loadOrCreateGame
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void runGameAction(language === 'en' ? 'Connecting to cloud Supabase...' : '正在连接云端 Supabase...', loadOrCreateGame);
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
        // 监听到登出 / 切换账号时，让 UI 立即回到登录注册页面，而不是停留在没有 snapshot 的空白游戏屏幕。
        if (event === 'SIGNED_OUT') {
          setNeedsLogin(true);
          setStatusMessage(language === 'en' ? 'Signed out. Sign in again or create a new account.' : '已退出登录，请重新登录或注册新账号。');
          setErrorMessage('');
        }
      }

      userIdRef.current = nextUserId;
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, [language]);

  const startNewGame = useCallback(() => {
    void runGameAction(language === 'en' ? 'Creating a new game...' : '正在创建新游戏...', async () => {
      const created = await createGame();
      setSnapshot(created);
      setLastMetricChanges(null);
      setRoundMeta(null);
      localStorage.setItem(activeGameKey(userIdRef.current), created.game.id);
      setStatusMessage(language === 'en' ? 'Created a new game. Generate Round 1 events.' : '已创建新游戏，请生成第 1 回合随机事件。');
    });
  }, [language, runGameAction]);

  const advance = useCallback(() => {
    void runGameAction(language === 'en' ? 'Synchronizing stage...' : '正在同步阶段...', async () => {
      if (!snapshot) {
        await loadOrCreateGame();
        return;
      }
      await advanceGame(snapshot, buildOrchestratorDeps());
    });
  }, [buildOrchestratorDeps, language, loadOrCreateGame, runGameAction, snapshot]);

  const submitProposalCallback = useCallback(
    (proposal: string) => {
      void runGameAction(language === 'en' ? 'Submitting proposal and waiting for AI ruling...' : '正在提交提案并等待 AI 裁定...', async () => {
        if (!snapshot) {
          throw new Error(language === 'en' ? 'Create a game first.' : '请先创建游戏。');
        }
        await submitProposalAction(snapshot, proposal, buildOrchestratorDeps());
      });
    },
    [buildOrchestratorDeps, language, runGameAction, snapshot],
  );

  const onLoginSuccess = useCallback(() => {
    setNeedsLogin(false);
    bootstrappedRef.current = false;
    void runGameAction(language === 'en' ? 'Connecting to cloud Supabase...' : '正在连接云端 Supabase...', loadOrCreateGame);
  }, [language, loadOrCreateGame, runGameAction]);

  /**
   * 退出登录：调用 Supabase Auth signOut，剩余的清理由 onAuthStateChange 的 SIGNED_OUT 分支负责。
   * 这里设 isBusy/statusMessage 让按钮在等待时给玩家可见的反馈。
   */
  const signOut = useCallback(() => {
    void runGameAction(language === 'en' ? 'Signing out...' : '正在退出登录...', async () => {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) {
        throw error;
      }
    });
  }, [language, runGameAction]);

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
      signOut,
    },
  };
}
