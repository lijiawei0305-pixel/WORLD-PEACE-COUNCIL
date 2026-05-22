import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DiplomacyGlobe from './components/globe/DiplomacyGlobe';
import BottomCommandPanel from './components/hud/BottomCommandPanel';
import LeftPanels from './components/hud/LeftPanels';
import RightPanels from './components/hud/RightPanels';
import TopBar from './components/hud/TopBar';
import type {
  AllianceState,
  EventSeverity,
  EventType,
  GameSnapshot,
  MetricChanges,
  RoundEvent,
  RoundStage,
  WorldState,
} from './contracts/game';
import {
  allianceProfiles,
  councilAlliances,
  worldMetrics as demoWorldMetrics,
  type AllianceProfile,
  type GlobeSelection,
  type TurnEvent,
  type WorldMetric,
} from './data/worldPeaceCouncil';
import {
  ApiClientError,
  advanceStage,
  createGame,
  generateEvents,
  getGameState,
  getSupabaseClient,
  nextRound,
  settleRound,
  submitProposal,
} from './lib/apiClient';
import './styles/app.css';
import './styles/globe.css';
import './styles/hud.css';
import './styles/wpc.css';

const ACTIVE_GAME_STORAGE_KEY = 'wpc.activeGameId';
const LAST_METRIC_CHANGES_STORAGE_KEY = 'wpc.lastMetricChanges';
const PLAYTEST_EMAIL = import.meta.env.VITE_PLAYTEST_EMAIL ?? 'playtest@example.com';
const PLAYTEST_PASSWORD = import.meta.env.VITE_PLAYTEST_PASSWORD ?? 'playtest123';
let pendingInitialGame: Promise<GameSnapshot> | null = null;

const stageIndexByRoundStage: Record<RoundStage, number> = {
  RANDOM_EVENT: 0,
  SITUATION_OVERVIEW: 1,
  DIPLOMATIC_PROPOSAL: 2,
  AI_ADJUDICATION: 3,
  ROUND_SETTLEMENT: 4,
};

const backendAllianceIdToDisplayId: Record<string, AllianceProfile['id']> = {
  north_west: 'north_american_western_alliance',
  china: 'zhonghua_alliance',
  russia: 'russian_alliance',
  middle_east: 'middle_east_islamic_alliance',
  africa: 'african_union',
  latin_america: 'latin_american_south_american_alliance',
  southeast_asia: 'southeast_asia_alliance',
};

const eventTypeLabel: Record<EventType, string> = {
  MILITARY: '军事',
  ENERGY: '能源',
  CYBER: '网络',
  AI: 'AI',
  FOOD: '粮食',
  REFUGEE: '难民',
  ECONOMY: '经济',
  DIPLOMACY: '外交',
  SUPPLY_CHAIN: '供应链',
};

const eventSeverityRisk: Record<EventSeverity, TurnEvent['risk']> = {
  HIGH: '高危',
  MEDIUM: '中危',
  LOW: '中危',
  OPPORTUNITY: '机会',
};

const stanceLabels: ReadonlySet<string> = new Set(['友好', '支持', '合作', '中立', '观望', '警惕', '强硬', '敌对']);

type RoundMeta = {
  briefing?: string;
  priorityIssue?: string;
  roundNumber: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRoundDate(round: number): string {
  const date = new Date(Date.UTC(2038, 0, 18));
  date.setUTCMonth(date.getUTCMonth() + round - 1);
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

function getMetricValue(worldState: WorldState | undefined, key: keyof WorldState, fallbackId: string): number {
  return worldState?.[key] ?? demoWorldMetrics.find((metric) => metric.id === fallbackId)?.value ?? 0;
}

function mapWorldStateToMetrics(worldState?: WorldState): WorldMetric[] {
  return [
    {
      id: 'tension',
      label: '全球紧张度',
      icon: '!',
      value: getMetricValue(worldState, 'globalTension', 'tension'),
      max: 100,
      tone: 'red',
    },
    {
      id: 'stability',
      label: '世界稳定度',
      icon: '+',
      value: getMetricValue(worldState, 'worldStability', 'stability'),
      max: 100,
      tone: 'green',
    },
    {
      id: 'aiRisk',
      label: 'AI 风险指数',
      icon: 'AI',
      value: getMetricValue(worldState, 'aiRisk', 'aiRisk'),
      max: 100,
      tone: 'yellow',
    },
    {
      id: 'economy',
      label: '经济压力',
      icon: '$',
      value: getMetricValue(worldState, 'economicPressure', 'economy'),
      max: 100,
      tone: 'blue',
    },
    {
      id: 'humanitarian',
      label: '人道危机',
      icon: 'H',
      value: getMetricValue(worldState, 'humanitarianCrisis', 'humanitarian'),
      max: 100,
      tone: 'orange',
    },
    {
      id: 'peaceAgreement',
      label: '和平协议',
      icon: 'P',
      value: worldState?.peaceAgreement ?? 20,
      max: 100,
      tone: 'blue',
    },
  ];
}

function normalizeStance(stance: string, satisfaction: number): AllianceProfile['stance'] {
  if (stanceLabels.has(stance)) {
    return stance as AllianceProfile['stance'];
  }

  if (satisfaction >= 75) {
    return '支持';
  }

  if (satisfaction >= 60) {
    return '合作';
  }

  if (satisfaction >= 45) {
    return '中立';
  }

  if (satisfaction >= 30) {
    return '警惕';
  }

  return '敌对';
}

function stanceToneFromState(stance: AllianceProfile['stance'], satisfaction: number): AllianceProfile['stanceTone'] {
  if (stance === '敌对') {
    return 'hostile';
  }

  if (stance === '强硬') {
    return 'hardline';
  }

  if (stance === '警惕') {
    return 'alert';
  }

  if (stance === '观望') {
    return 'watch';
  }

  if (stance === '友好') {
    return 'friendly';
  }

  if (stance === '支持' || satisfaction >= 75) {
    return 'support';
  }

  return 'neutral';
}

function findBaseAlliance(state: AllianceState): AllianceProfile {
  const mappedId = backendAllianceIdToDisplayId[state.allianceId];
  const matched = councilAlliances.find((alliance) => (
    alliance.id === state.allianceId ||
    alliance.id === mappedId ||
    alliance.name === state.allianceName ||
    alliance.shortName === state.allianceId
  ));

  return matched ?? allianceProfiles.north_american_western_alliance;
}

function mapAllianceStatesToProfiles(states?: AllianceState[]): AllianceProfile[] {
  if (!states?.length) {
    return councilAlliances;
  }

  return states.map((state) => {
    const base = findBaseAlliance(state);
    const stance = normalizeStance(state.stance, state.satisfaction);

    return {
      ...base,
      name: state.allianceName || base.name,
      stance,
      stanceTone: stanceToneFromState(stance, state.satisfaction),
      satisfaction: state.satisfaction,
      demand: state.currentDemand || base.demand,
    };
  });
}

function mapRoundEventsToTurnEvents(events?: RoundEvent[]): TurnEvent[] {
  return events?.map((event) => ({
    id: event.id,
    title: event.title,
    risk: eventSeverityRisk[event.severity],
    topic: eventTypeLabel[event.type],
  })) ?? [];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.message}（${error.code}）`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '发生未知错误。';
}

function readStoredMetricChanges(gameId: string): MetricChanges | null {
  const raw = localStorage.getItem(LAST_METRIC_CHANGES_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!isRecord(parsed) || parsed.gameId !== gameId || !isRecord(parsed.metricChanges)) {
      return null;
    }

    return {
      globalTension: typeof parsed.metricChanges.globalTension === 'number' ? parsed.metricChanges.globalTension : undefined,
      worldStability: typeof parsed.metricChanges.worldStability === 'number' ? parsed.metricChanges.worldStability : undefined,
      aiRisk: typeof parsed.metricChanges.aiRisk === 'number' ? parsed.metricChanges.aiRisk : undefined,
      economicPressure: typeof parsed.metricChanges.economicPressure === 'number' ? parsed.metricChanges.economicPressure : undefined,
      humanitarianCrisis: typeof parsed.metricChanges.humanitarianCrisis === 'number'
        ? parsed.metricChanges.humanitarianCrisis
        : undefined,
      peaceAgreement: typeof parsed.metricChanges.peaceAgreement === 'number' ? parsed.metricChanges.peaceAgreement : undefined,
    };
  } catch {
    return null;
  }
}

function storeMetricChanges(gameId: string, metricChanges: MetricChanges): void {
  localStorage.setItem(
    LAST_METRIC_CHANGES_STORAGE_KEY,
    JSON.stringify({
      gameId,
      metricChanges,
    }),
  );
}

async function ensurePlaytestSession(): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(`读取登录状态失败：${sessionError.message}`);
  }

  if (sessionData.session) {
    return;
  }

  const signInResult = await supabase.auth.signInWithPassword({
    email: PLAYTEST_EMAIL,
    password: PLAYTEST_PASSWORD,
  });

  if (!signInResult.error && signInResult.data.session) {
    return;
  }

  const signUpResult = await supabase.auth.signUp({
    email: PLAYTEST_EMAIL,
    password: PLAYTEST_PASSWORD,
    options: {
      data: {
        display_name: '首席秩序架构师',
      },
    },
  });

  if (signUpResult.error && !signUpResult.error.message.toLowerCase().includes('already')) {
    throw new Error(`创建本地测试用户失败：${signUpResult.error.message}`);
  }

  if (signUpResult.data.session) {
    return;
  }

  const retrySignInResult = await supabase.auth.signInWithPassword({
    email: PLAYTEST_EMAIL,
    password: PLAYTEST_PASSWORD,
  });

  if (retrySignInResult.error || !retrySignInResult.data.session) {
    throw new Error('本地测试用户未能登录。请确认 Supabase Auth 已启动，并且本地项目允许邮箱密码登录。');
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

export default function App() {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [lastMetricChanges, setLastMetricChanges] = useState<MetricChanges | null>(null);
  const [roundMeta, setRoundMeta] = useState<RoundMeta | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<GlobeSelection>();
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState('正在连接后端...');
  const [errorMessage, setErrorMessage] = useState('');
  const bootstrappedRef = useRef(false);

  const round = snapshot?.game.currentRound ?? 1;
  const maxRounds = snapshot?.game.maxRounds ?? 20;
  const activeStageIndex = snapshot ? stageIndexByRoundStage[snapshot.game.stage] : 0;
  const submittedProposal = snapshot?.proposal?.proposalText ?? '';
  const currentRoundMeta = roundMeta?.roundNumber === round ? roundMeta : null;
  const metrics = useMemo(() => mapWorldStateToMetrics(snapshot?.worldState), [snapshot?.worldState]);
  const alliances = useMemo(() => mapAllianceStatesToProfiles(snapshot?.alliances), [snapshot?.alliances]);
  const events = useMemo(() => mapRoundEventsToTurnEvents(snapshot?.events), [snapshot?.events]);
  const displayedMetricChanges = snapshot?.settlement?.metricChanges ?? lastMetricChanges;

  const rememberMetricChanges = useCallback((gameId: string, metricChanges: MetricChanges | null | undefined) => {
    if (!metricChanges) {
      return;
    }

    setLastMetricChanges(metricChanges);
    storeMetricChanges(gameId, metricChanges);
  }, []);

  const runGameAction = useCallback(async (message: string, action: () => Promise<void>) => {
    setIsBusy(true);
    setStatusMessage(message);
    setErrorMessage('');

    try {
      await ensurePlaytestSession();
      await action();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }, []);

  const loadOrCreateGame = useCallback(async () => {
    const savedGameId = localStorage.getItem(ACTIVE_GAME_STORAGE_KEY);

    if (savedGameId) {
      try {
        const savedSnapshot = await getGameState(savedGameId);
        setSnapshot(savedSnapshot);
        setLastMetricChanges(savedSnapshot.settlement?.metricChanges ?? readStoredMetricChanges(savedSnapshot.game.id));
        setStatusMessage(`已恢复第 ${savedSnapshot.game.currentRound} 回合。`);
        return;
      } catch (error) {
        localStorage.removeItem(ACTIVE_GAME_STORAGE_KEY);
        console.warn('恢复本地游戏失败，将创建新游戏。', error);
      }
    }

    const createdSnapshot = await createInitialGameOnce();
    setSnapshot(createdSnapshot);
    setLastMetricChanges(null);
    setRoundMeta(null);
    localStorage.setItem(ACTIVE_GAME_STORAGE_KEY, createdSnapshot.game.id);
    setStatusMessage('已创建第 1 回合，请生成本回合随机事件。');
  }, []);

  useEffect(() => {
    if (bootstrappedRef.current) {
      return;
    }

    bootstrappedRef.current = true;
    void runGameAction('正在连接本地 Supabase...', loadOrCreateGame);
  }, [loadOrCreateGame, runGameAction]);

  const handleLocationSelect = useCallback((selection: GlobeSelection) => {
    setSelectedLocation(selection);
  }, []);

  const handleNewGame = useCallback(() => {
    void runGameAction('正在创建新游戏...', async () => {
      const createdSnapshot = await createGame();
      setSnapshot(createdSnapshot);
      setLastMetricChanges(null);
      setRoundMeta(null);
      setSelectedLocation(undefined);
      localStorage.setItem(ACTIVE_GAME_STORAGE_KEY, createdSnapshot.game.id);
      setStatusMessage('已创建新游戏，请生成第 1 回合随机事件。');
    });
  }, [runGameAction]);

  const refreshGameState = useCallback(async (gameId: string): Promise<GameSnapshot> => {
    const refreshedSnapshot = await getGameState(gameId);
    setSnapshot(refreshedSnapshot);
    return refreshedSnapshot;
  }, []);

  const handleAdvanceStage = useCallback(() => {
    void runGameAction('正在同步阶段...', async () => {
      if (!snapshot) {
        await loadOrCreateGame();
        return;
      }

      const gameId = snapshot.game.id;
      const roundNumber = snapshot.currentRound;

      if (snapshot.game.stage === 'RANDOM_EVENT') {
        if (snapshot.events.length === 0) {
          const response = await generateEvents(gameId, roundNumber);

          setSnapshot((currentSnapshot) => {
            if (!currentSnapshot || currentSnapshot.game.id !== gameId) {
              return currentSnapshot;
            }

            return {
              ...currentSnapshot,
              events: response.events,
              worldState: response.worldState,
            };
          });
          setRoundMeta({
            roundNumber,
            briefing: response.roundBriefing,
            priorityIssue: response.priorityIssue,
          });
          setStatusMessage(`已生成 ${response.events.length} 个随机事件，请进入局势总览。`);
          return;
        }

        await advanceStage(gameId);
        await refreshGameState(gameId);
        setStatusMessage('已进入局势总览。');
        return;
      }

      if (snapshot.game.stage === 'SITUATION_OVERVIEW') {
        await advanceStage(gameId);
        await refreshGameState(gameId);
        setStatusMessage('已进入外交提案阶段。');
        return;
      }

      if (snapshot.game.stage === 'DIPLOMATIC_PROPOSAL') {
        throw new Error('当前阶段需要先提交外交提案。');
      }

      if (snapshot.game.stage === 'AI_ADJUDICATION') {
        await settleRound(gameId, roundNumber);
        const settledSnapshot = await refreshGameState(gameId);
        rememberMetricChanges(gameId, settledSnapshot.settlement?.metricChanges);
        setStatusMessage(
          settledSnapshot.game.status === 'ACTIVE'
            ? '回合结算完成，可以进入下一回合。'
            : `游戏已结束：${settledSnapshot.game.status}`,
        );
        return;
      }

      if (snapshot.game.stage === 'ROUND_SETTLEMENT') {
        if (snapshot.game.status !== 'ACTIVE') {
          setStatusMessage('游戏已经结束，请创建新游戏。');
          return;
        }

        if (snapshot.game.currentRound >= snapshot.game.maxRounds) {
          setStatusMessage('已到达最大回合数，不能继续推进。');
          return;
        }

        rememberMetricChanges(gameId, snapshot.settlement?.metricChanges);
        const nextSnapshot = await nextRound(gameId);
        setSnapshot(nextSnapshot);
        setRoundMeta(null);
        setSelectedLocation(undefined);
        setStatusMessage(`已进入第 ${nextSnapshot.game.currentRound} 回合，请生成随机事件。`);
      }
    });
  }, [loadOrCreateGame, refreshGameState, rememberMetricChanges, runGameAction, snapshot]);

  const handleSubmitProposal = useCallback((proposal: string) => {
    void runGameAction('正在提交提案并等待 AI 裁定...', async () => {
      if (!snapshot) {
        throw new Error('请先创建游戏。');
      }

      if (snapshot.game.stage !== 'DIPLOMATIC_PROPOSAL') {
        throw new Error('只有外交提案阶段可以提交提案。');
      }

      const response = await submitProposal(snapshot.game.id, snapshot.currentRound, proposal);
      await refreshGameState(snapshot.game.id);
      setStatusMessage(`AI 裁定完成：${response.adjudication.aiAssessment.summary}`);
    });
  }, [refreshGameState, runGameAction, snapshot]);

  return (
    <main className="game-shell">
      <div className="space-bg" />
      <DiplomacyGlobe
        selectedCountry={selectedLocation?.isoA3 ?? ''}
        selectedLocation={selectedLocation}
        onLocationSelect={handleLocationSelect}
      />

      <section className="hud-layer" aria-label="Game interface">
        <TopBar
          activeStageIndex={activeStageIndex}
          round={round}
          maxRounds={maxRounds}
          date={getRoundDate(round)}
          gameStatus={snapshot?.game.status}
          isBusy={isBusy}
          onNewGame={handleNewGame}
          worldState={snapshot?.worldState}
        />
        <LeftPanels
          activeStageIndex={activeStageIndex}
          alliances={alliances}
          briefing={currentRoundMeta?.briefing}
          eventCount={snapshot?.events.length ?? 0}
          gameStatus={snapshot?.game.status}
          metrics={metrics}
          selectedLocation={selectedLocation}
        />
        <RightPanels
          activeStageIndex={activeStageIndex}
          adjudication={snapshot?.adjudication}
          alliances={alliances}
          events={events}
          priorityIssue={currentRoundMeta?.priorityIssue}
          settlement={snapshot?.settlement}
          submittedProposal={submittedProposal}
        />
        <BottomCommandPanel
          activeStageIndex={activeStageIndex}
          errorMessage={errorMessage}
          gameStatus={snapshot?.game.status}
          hasEvents={(snapshot?.events.length ?? 0) > 0}
          hasGame={Boolean(snapshot)}
          isBusy={isBusy}
          metricChanges={displayedMetricChanges}
          statusMessage={statusMessage}
          submittedProposal={submittedProposal}
          onAdvanceStage={handleAdvanceStage}
          onSubmitProposal={handleSubmitProposal}
        />
      </section>
    </main>
  );
}
