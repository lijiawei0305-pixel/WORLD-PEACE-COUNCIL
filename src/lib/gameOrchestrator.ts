/**
 * 把"在某个 RoundStage 下点击 advance 应该调哪个 API、改哪些状态"的编排逻辑从 React 组件中剥离。
 * 通过一个 `OrchestratorDeps` 对象把 React state setter 注入进来，函数本身不依赖 React，便于单测。
 */
import type { GameSnapshot, MetricChanges, RoundStage } from '../contracts/game';
import {
  advanceStage,
  generateEvents,
  getGameState,
  nextRound,
  settleRound,
  submitProposal,
} from './apiClient';
import type { Language } from './i18n';

/** orchestrator 需要的副作用注入。useGameSession 在内部把 setter 包好后传入。 */
export type OrchestratorDeps = {
  setSnapshot: (updater: GameSnapshot | null | ((prev: GameSnapshot | null) => GameSnapshot | null)) => void;
  setStatusMessage: (message: string) => void;
  setRoundMeta: (meta: { roundNumber: number; briefing?: string; priorityIssue?: string } | null) => void;
  rememberMetricChanges: (gameId: string, metricChanges: MetricChanges | null | undefined) => void;
  resetSelectedLocation: () => void;
  language: Language;
  uiText: {
    generatedEvents: (count: number) => string;
    enteredOverview: string;
    enteredProposal: string;
    proposalRequired: string;
    settlementComplete: string;
    gameEnded: (status: string) => string;
    gameAlreadyEnded: string;
    maxRoundsReached: string;
    enteredRound: (round: number) => string;
    submitOnlyProposalStage: string;
    aiRulingComplete: (summary: string) => string;
  };
};

/** 用 stage 作 key 的处理器表，替代 if-else 链。 */
type StageHandler = (snapshot: GameSnapshot, deps: OrchestratorDeps) => Promise<void>;

async function refresh(gameId: string, deps: OrchestratorDeps): Promise<GameSnapshot> {
  const refreshed = await getGameState(gameId);
  deps.setSnapshot(refreshed);
  return refreshed;
}

const handleRandomEvent: StageHandler = async (snapshot, deps) => {
  const gameId = snapshot.game.id;
  const roundNumber = snapshot.currentRound;

  if (snapshot.events.length === 0) {
    const response = await generateEvents(gameId, roundNumber, deps.language);

    deps.setSnapshot((current) => {
      if (!current || current.game.id !== gameId) {
        return current;
      }
      return { ...current, events: response.events, worldState: response.worldState };
    });
    deps.setRoundMeta({
      roundNumber,
      briefing: response.roundBriefing,
      priorityIssue: response.priorityIssue,
    });
    deps.setStatusMessage(deps.uiText.generatedEvents(response.events.length));
    return;
  }

  await advanceStage(gameId);
  await refresh(gameId, deps);
  deps.setStatusMessage(deps.uiText.enteredOverview);
};

const handleSituationOverview: StageHandler = async (snapshot, deps) => {
  await advanceStage(snapshot.game.id);
  await refresh(snapshot.game.id, deps);
  deps.setStatusMessage(deps.uiText.enteredProposal);
};

const handleDiplomaticProposal: StageHandler = async () => {
  throw new Error('PROPOSAL_STAGE_SUBMIT_REQUIRED');
};

const handleAiAdjudication: StageHandler = async (snapshot, deps) => {
  const gameId = snapshot.game.id;
  await settleRound(gameId, snapshot.currentRound);
  const settled = await refresh(gameId, deps);
  deps.rememberMetricChanges(gameId, settled.settlement?.metricChanges);
  deps.setStatusMessage(
    settled.game.status === 'ACTIVE'
      ? deps.uiText.settlementComplete
      : deps.uiText.gameEnded(settled.game.status),
  );
};

const handleRoundSettlement: StageHandler = async (snapshot, deps) => {
  if (snapshot.game.status !== 'ACTIVE') {
    deps.setStatusMessage(deps.uiText.gameAlreadyEnded);
    return;
  }
  if (snapshot.game.currentRound >= snapshot.game.maxRounds) {
    deps.setStatusMessage(deps.uiText.maxRoundsReached);
    return;
  }

  deps.rememberMetricChanges(snapshot.game.id, snapshot.settlement?.metricChanges);
  const next = await nextRound(snapshot.game.id);
  deps.setSnapshot(next);
  deps.setRoundMeta(null);
  deps.resetSelectedLocation();
  deps.setStatusMessage(deps.uiText.enteredRound(next.game.currentRound));
};

const stageHandlers: Record<RoundStage, StageHandler> = {
  RANDOM_EVENT: handleRandomEvent,
  SITUATION_OVERVIEW: handleSituationOverview,
  DIPLOMATIC_PROPOSAL: handleDiplomaticProposal,
  AI_ADJUDICATION: handleAiAdjudication,
  ROUND_SETTLEMENT: handleRoundSettlement,
};

/**
 * 推进当前 stage：根据 snapshot.game.stage 路由到对应的处理器。
 * 不在这里做 try/catch，错误向上传给 useGameSession 的 runGameAction 统一处理。
 */
export async function advanceGame(snapshot: GameSnapshot, deps: OrchestratorDeps): Promise<void> {
  const handler = stageHandlers[snapshot.game.stage];
  await handler(snapshot, deps);
}

/**
 * 提交外交提案：保存提案 + 等待 AI 裁定 + 刷新 snapshot。
 * stage 必须是 DIPLOMATIC_PROPOSAL，否则抛错由上层 statusMessage / errorMessage 渲染。
 */
export async function submitProposalAction(
  snapshot: GameSnapshot,
  proposal: string,
  deps: OrchestratorDeps,
): Promise<void> {
  if (snapshot.game.stage !== 'DIPLOMATIC_PROPOSAL') {
    throw new Error('SUBMIT_ONLY_PROPOSAL_STAGE');
  }

  const response = await submitProposal(snapshot.game.id, snapshot.currentRound, proposal, deps.language);
  await refresh(snapshot.game.id, deps);
  deps.setStatusMessage(deps.uiText.aiRulingComplete(response.adjudication.aiAssessment.summary));
}
