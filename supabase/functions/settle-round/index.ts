// AI 仅负责评估（submit-proposal 阶段），结算由规则引擎执行，不调用 AI
import { EvaluateProposalOutputSchema, type AiSource } from '../_shared/aiSchemas.ts';
import { handleOptions } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import {
  applyMetricChanges,
  clampMetricChanges,
  clampValue,
  getGameStatus,
  getStanceFromSatisfaction,
} from '../_shared/ruleEngine.ts';
import { createServiceRoleClient } from '../_shared/supabaseClient.ts';
import type {
  EventResolutionStatus,
  EventSeverity,
  EventType,
  GameStatus,
  MetricChanges,
  RoundSettlement,
  RoundStage,
  WorldState,
} from '../_shared/types.ts';

type EvaluateProposalOutput = ReturnType<typeof EvaluateProposalOutputSchema.parse>;

type SettleRoundRequest = {
  gameId: string;
  roundNumber: number;
};

type GameSessionRow = {
  id: string;
  user_id: string | null;
  status: GameStatus;
  current_round: number;
  current_stage: RoundStage;
  global_tension: number;
  world_stability: number;
  ai_risk: number;
  economic_pressure: number;
  humanitarian_crisis: number;
  peace_agreement: number;
  history_summary: string | null;
};

type RoundRow = {
  id: string;
  round_number: number;
  starting_world_state: WorldState;
  after_events_world_state: WorldState | null;
};

type RoundEventRow = {
  id: string;
  title: string;
  type: EventType;
  severity: EventSeverity;
  description: string;
  involved_alliances: string[];
  involved_countries: string[];
  potential_impact: MetricChanges;
  recommended_actions: string[];
  unresolved_consequence: string | null;
  resolution_status: EventResolutionStatus;
};

type ProposalRow = {
  id: string;
  proposal_text: string;
};

type AIAdjudicationRow = {
  id: string;
  proposal_id: string;
  parsed_output: EvaluateProposalOutput;
};

type AllianceStateRow = {
  id: string;
  alliance_id: string;
  stance: string;
  satisfaction: number;
  current_demand: string | null;
  pressure_tags: string[] | null;
  last_reaction: string | null;
  alliances: {
    name: string;
    short_name: string | null;
  } | null;
};

type SettlementRow = {
  id: string;
  metric_changes: MetricChanges;
  new_world_state: WorldState;
  event_results: RoundSettlement['eventResults'] | null;
  alliance_changes: RoundSettlement['allianceChanges'] | null;
  next_round_warnings: string[] | null;
  rating: string | null;
  rating_text: string | null;
  summary: string | null;
  game_status_after: GameStatus | null;
};

type SettleRoundResponse = {
  settlement: RoundSettlement;
  aiSource: AiSource;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const GAME_SELECT = `
  id,
  user_id,
  status,
  current_round,
  current_stage,
  global_tension,
  world_stability,
  ai_risk,
  economic_pressure,
  humanitarian_crisis,
  peace_agreement,
  history_summary
`;

const ROUND_EVENT_SELECT = `
  id,
  title,
  type,
  severity,
  description,
  involved_alliances,
  involved_countries,
  potential_impact,
  recommended_actions,
  unresolved_consequence,
  resolution_status
`;

const SETTLEMENT_SELECT = `
  id,
  metric_changes,
  new_world_state,
  event_results,
  alliance_changes,
  next_round_warnings,
  rating,
  rating_text,
  summary,
  game_status_after
`;

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  return authorization.slice('Bearer '.length).trim() || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function parseRequestBody(request: Request): Promise<SettleRoundRequest | null> {
  const body: unknown = await request.json().catch(() => null);

  if (
    !isRecord(body) ||
    typeof body.gameId !== 'string' ||
    !UUID_PATTERN.test(body.gameId) ||
    typeof body.roundNumber !== 'number' ||
    !Number.isInteger(body.roundNumber) ||
    body.roundNumber < 1 ||
    body.roundNumber > 20
  ) {
    return null;
  }

  return {
    gameId: body.gameId,
    roundNumber: body.roundNumber,
  };
}

const SETTLEMENT_METRIC_KEYS: Array<keyof WorldState> = [
  'globalTension',
  'worldStability',
  'aiRisk',
  'economicPressure',
  'humanitarianCrisis',
  'peaceAgreement',
];

/**
 * 计算"本回合从 starting_world_state 到结算后 newWorldState 的总变化"，
 * 涵盖事件本身造成的世界状态变动 + AI 对玩家提案给出的 expectedImpact。
 * 这样 UI 上展示给玩家的回合 metric delta 与顶部世界状态的绝对值能够对得上。
 */
function computeRoundDelta(starting: WorldState, ending: WorldState): MetricChanges {
  const delta: MetricChanges = {};

  for (const key of SETTLEMENT_METRIC_KEYS) {
    delta[key] = ending[key] - starting[key];
  }

  return delta;
}

function worldStateFromGame(game: GameSessionRow): WorldState {
  return {
    globalTension: game.global_tension,
    worldStability: game.world_stability,
    aiRisk: game.ai_risk,
    economicPressure: game.economic_pressure,
    humanitarianCrisis: game.humanitarian_crisis,
    peaceAgreement: game.peace_agreement,
  };
}

function parseRating(rating: string | null): number {
  if (!rating) {
    return 0;
  }

  const parsedRating = Number.parseInt(rating, 10);
  return Number.isNaN(parsedRating) ? 0 : clampValue(parsedRating);
}

function mapSettlement(row: SettlementRow, roundNumber: number): RoundSettlement {
  return {
    round: roundNumber,
    summary: row.summary ?? '',
    metricChanges: row.metric_changes,
    newWorldState: row.new_world_state,
    eventResults: row.event_results ?? [],
    allianceChanges: row.alliance_changes ?? [],
    nextRoundWarnings: row.next_round_warnings ?? [],
    rating: parseRating(row.rating),
    ratingText: row.rating_text ?? row.rating ?? '',
    gameStatus: row.game_status_after ?? 'ACTIVE',
  };
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function getAllianceMatchKey(row: AllianceStateRow): string[] {
  const keys = [row.alliance_id];

  if (row.alliances?.name) {
    keys.push(row.alliances.name);
  }

  if (row.alliances?.short_name) {
    keys.push(row.alliances.short_name);
  }

  return keys.map(normalizeToken);
}

function findAllianceState(alliance: string, rows: AllianceStateRow[]): AllianceStateRow | undefined {
  const target = normalizeToken(alliance);
  return rows.find((row) => getAllianceMatchKey(row).includes(target));
}

function findForecastForEvent(
  event: RoundEventRow,
  adjudication: EvaluateProposalOutput,
): EvaluateProposalOutput['eventResolutionForecast'][number] | undefined {
  return adjudication.eventResolutionForecast.find((forecast) => forecast.eventId === event.id);
}

function buildEventResults(events: RoundEventRow[], adjudication: EvaluateProposalOutput): RoundSettlement['eventResults'] {
  return events.map((event) => {
    const forecast = findForecastForEvent(event, adjudication);

    return {
      eventId: event.id,
      title: event.title,
      resolutionStatus: forecast?.resolutionStatus ?? event.resolution_status,
      summary: forecast?.reason ?? '本事件未在本回合获得实质解决。',
      metricChanges: clampMetricChanges(forecast?.expectedImpact ?? {}),
    };
  });
}

function buildAllianceChanges(
  allianceRows: AllianceStateRow[],
  adjudication: EvaluateProposalOutput,
): RoundSettlement['allianceChanges'] {
  return adjudication.allianceReactions.flatMap((reaction) => {
    const allianceState = findAllianceState(reaction.alliance, allianceRows);

    if (!allianceState) {
      return [];
    }

    const newSatisfaction = clampValue(allianceState.satisfaction + reaction.satisfactionDelta);

    return [
      {
        allianceId: allianceState.alliance_id,
        allianceName: allianceState.alliances?.name ?? allianceState.alliance_id,
        satisfactionDelta: reaction.satisfactionDelta,
        newSatisfaction,
        stance: getStanceFromSatisfaction(newSatisfaction),
        currentDemand: allianceState.current_demand ?? '',
        pressureTags: allianceState.pressure_tags ?? [],
      },
    ];
  });
}

function buildNextRoundWarnings(adjudication: EvaluateProposalOutput): string[] {
  return adjudication.nextRoundRisks.map((risk) => `${risk.title}：${risk.description}`);
}

function getRating(metricChanges: MetricChanges, gameStatus: GameStatus): number {
  if (gameStatus === 'FAILED') {
    return 0;
  }

  if (gameStatus === 'WON') {
    return 100;
  }

  const tensionScore = -(metricChanges.globalTension ?? 0) * 2;
  const stabilityScore = (metricChanges.worldStability ?? 0) * 2;
  const peaceScore = (metricChanges.peaceAgreement ?? 0) * 3;
  const riskPenalty = (metricChanges.aiRisk ?? 0) + (metricChanges.economicPressure ?? 0) + (metricChanges.humanitarianCrisis ?? 0);

  return Math.round(clampValue(60 + tensionScore + stabilityScore + peaceScore - riskPenalty));
}

function getRatingText(rating: number, gameStatus: GameStatus): string {
  if (gameStatus === 'FAILED') {
    return '秩序崩溃';
  }

  if (gameStatus === 'WON') {
    return '和平框架达成';
  }

  if (gameStatus === 'COLD_PEACE') {
    return '冷和平';
  }

  if (rating >= 75) {
    return '显著缓和';
  }

  if (rating >= 55) {
    return '有限缓和';
  }

  if (rating >= 35) {
    return '局势胶着';
  }

  return '局势恶化';
}

/**
 * 构造单回合历史摘要条目，喂给下一回合的 generate-events / submit-proposal 提示词。
 * 设计：单条 ≤ 130 字，避免膨胀 token。
 *
 * 字段精度足以让 AI 识别"上一回合做了什么、效果如何"：
 *   - 事件 type 列表（只取前 3 个 type）
 *   - proposalUnderstanding.mainGoal（已是 ≤ 60 字 AI 摘要）
 *   - rating + ratingText
 *   - 关键 metric delta（只保留最显著的紧张度和和平度变化）
 */
function buildHistoryEntry(
  roundNumber: number,
  events: Array<{ type: EventType }>,
  adjudication: EvaluateProposalOutput,
  metricChanges: MetricChanges,
  rating: number,
  ratingText: string,
): string {
  const eventTags = events.slice(0, 3).map((event) => event.type).join('/');
  const goal = adjudication.proposalUnderstanding.mainGoal.slice(0, 30);
  const fmt = (n: number | undefined): string => {
    if (typeof n !== 'number' || n === 0) return '0';
    return n > 0 ? `+${n}` : `${n}`;
  };
  const tension = fmt(metricChanges.globalTension);
  const peace = fmt(metricChanges.peaceAgreement);

  return `第${roundNumber}回合｜事件[${eventTags}]｜提案:${goal}｜${rating}分(${ratingText})｜紧张${tension},和平${peace}`;
}

/**
 * 把新条目追加到现有 history_summary，并按行裁剪到最近 N 个回合。
 * 用换行分隔便于喂给 prompt 时人类可读、token-friendly。
 */
function appendHistorySummary(existing: string, newEntry: string, maxRounds = 5): string {
  const lines = (existing ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  lines.push(newEntry);
  return lines.slice(-maxRounds).join('\n');
}

Deno.serve(async (request) => {
  const optionsResponse = handleOptions(request);

  if (optionsResponse) {
    return optionsResponse;
  }

  if (request.method !== 'POST') {
    return errorResponse(request, 'METHOD_NOT_ALLOWED', '只支持 POST 请求。', 405);
  }

  const token = getBearerToken(request);

  if (!token) {
    return errorResponse(request, 'UNAUTHORIZED', '请先登录后再结算回合。', 401);
  }

  const body = await parseRequestBody(request);

  if (!body) {
    return errorResponse(request, 'INVALID_REQUEST', '请求体必须包含合法的 gameId 和 roundNumber。', 400);
  }

  const supabase = createServiceRoleClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const userId = userData.user?.id;

  if (userError || !userId) {
    return errorResponse(request, 'UNAUTHORIZED', '登录状态无效，请重新登录。', 401);
  }

  const { data: game, error: gameError } = await supabase
    .from('game_sessions')
    .select(GAME_SELECT)
    .eq('id', body.gameId)
    .returns<GameSessionRow[]>()
    .maybeSingle();

  if (gameError) {
    console.error('SETTLE_ROUND_GAME_QUERY_FAILED', gameError);
    return errorResponse(request, 'SETTLE_ROUND_FAILED', '读取游戏失败，请稍后重试。', 500);
  }

  if (!game) {
    return errorResponse(request, 'GAME_NOT_FOUND', '没有找到这局游戏。', 404);
  }

  if (game.user_id !== userId) {
    return errorResponse(request, 'FORBIDDEN', '你没有权限操作这局游戏。', 403);
  }

  if (game.current_round !== body.roundNumber) {
    return errorResponse(request, 'INVALID_ROUND', '请求回合不是当前回合。', 409);
  }

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('id, round_number, starting_world_state, after_events_world_state')
    .eq('game_id', game.id)
    .eq('round_number', body.roundNumber)
    .returns<RoundRow[]>()
    .maybeSingle();

  if (roundError || !round) {
    console.error('SETTLE_ROUND_ROUND_QUERY_FAILED', roundError);
    return errorResponse(request, 'ROUND_NOT_FOUND', '没有找到当前回合。', 404);
  }

  const { data: existingSettlement, error: existingSettlementError } = await supabase
    .from('settlements')
    .select(SETTLEMENT_SELECT)
    .eq('round_id', round.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .returns<SettlementRow[]>()
    .maybeSingle();

  if (existingSettlementError) {
    console.error('SETTLE_ROUND_EXISTING_QUERY_FAILED', existingSettlementError);
    return errorResponse(request, 'SETTLE_ROUND_FAILED', '检查已有结算失败。', 500);
  }

  if (existingSettlement) {
    return successResponse(request, {
      settlement: mapSettlement(existingSettlement, body.roundNumber),
      aiSource: 'live',
    } satisfies SettleRoundResponse);
  }

  if (game.status !== 'ACTIVE') {
    return errorResponse(request, 'GAME_NOT_ACTIVE', '这局游戏已经结束，不能再次结算。', 409);
  }

  if (game.current_stage !== 'AI_ADJUDICATION') {
    return errorResponse(request, 'INVALID_STAGE', '当前阶段不能结算回合。', 409);
  }

  const [
    eventsResult,
    proposalResult,
    adjudicationResult,
    allianceStatesResult,
  ] = await Promise.all([
    supabase
      .from('round_events')
      .select(ROUND_EVENT_SELECT)
      .eq('round_id', round.id)
      .order('created_at', { ascending: true })
      .returns<RoundEventRow[]>(),
    supabase.from('proposals').select('id, proposal_text').eq('round_id', round.id).returns<ProposalRow[]>().maybeSingle(),
    supabase
      .from('ai_adjudications')
      .select('id, proposal_id, parsed_output')
      .eq('round_id', round.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .returns<AIAdjudicationRow[]>()
      .maybeSingle(),
    supabase
      .from('game_alliance_states')
      .select(
        `
          id,
          alliance_id,
          stance,
          satisfaction,
          current_demand,
          pressure_tags,
          last_reaction,
          alliances (
            name,
            short_name
          )
        `,
      )
      .eq('game_id', game.id)
      .returns<AllianceStateRow[]>(),
  ]);

  if (eventsResult.error || !eventsResult.data) {
    console.error('SETTLE_ROUND_EVENTS_QUERY_FAILED', eventsResult.error);
    return errorResponse(request, 'SETTLE_ROUND_FAILED', '读取回合事件失败。', 500);
  }

  if (eventsResult.data.length === 0) {
    return errorResponse(request, 'ROUND_EVENTS_REQUIRED', '结算前必须已有回合事件。', 409);
  }

  if (proposalResult.error || !proposalResult.data) {
    console.error('SETTLE_ROUND_PROPOSAL_QUERY_FAILED', proposalResult.error);
    return errorResponse(request, 'PROPOSAL_REQUIRED', '结算前必须已有外交提案。', 409);
  }

  if (adjudicationResult.error || !adjudicationResult.data) {
    console.error('SETTLE_ROUND_ADJUDICATION_QUERY_FAILED', adjudicationResult.error);
    return errorResponse(request, 'ADJUDICATION_REQUIRED', '结算前必须已有 AI 裁定。', 409);
  }

  if (allianceStatesResult.error || !allianceStatesResult.data) {
    console.error('SETTLE_ROUND_ALLIANCE_STATES_QUERY_FAILED', allianceStatesResult.error);
    return errorResponse(request, 'SETTLE_ROUND_FAILED', '读取联盟状态失败。', 500);
  }

  const adjudicationParse = EvaluateProposalOutputSchema.safeParse(adjudicationResult.data.parsed_output);

  if (!adjudicationParse.success) {
    console.error('SETTLE_ROUND_ADJUDICATION_VALIDATION_FAILED', adjudicationParse.error);
    return errorResponse(request, 'SETTLE_ROUND_FAILED', 'AI 裁定数据格式无效。', 500);
  }

  const adjudication = adjudicationParse.data;
  // 自 migration 007 起：generate_events_v1 不再立即把事件影响写入 game_sessions。
  // 因此 worldStateFromGame(game) 在 RANDOM_EVENT/SITUATION_OVERVIEW/DIPLOMATIC_PROPOSAL 阶段
  // 仍然等于 round.starting_world_state。结算时需要主动把"事件影响后的世界状态"作为提案的应用基准，
  // 否则事件本身就再也不会落到最终世界指标里。
  // 兼容老局：如果 after_events_world_state 为空（极旧的 round 行），降级为 game 表里的当前世界状态。
  const startingWorldState = round.starting_world_state;
  const afterEventsWorldState = round.after_events_world_state ?? worldStateFromGame(game);
  const proposalImpact = clampMetricChanges(adjudication.aiAssessment.expectedImpact);
  const proposedWorldState = applyMetricChanges(afterEventsWorldState, proposalImpact);
  const newWorldState = afterEventsWorldState.globalTension >= 100
    ? { ...proposedWorldState, globalTension: 100 }
    : proposedWorldState;
  // metricChanges 展示给玩家时使用"本回合从 starting_world_state 到结算后 newWorldState 的总差值"，
  // 这样底部回合变化卡片与顶部世界指标的绝对值能够吻合（含事件影响 + 提案影响）。
  const metricChanges = computeRoundDelta(startingWorldState, newWorldState);
  const gameStatus = getGameStatus(newWorldState, game.current_round);
  const eventResults = buildEventResults(eventsResult.data, adjudication);
  const allianceChanges = buildAllianceChanges(allianceStatesResult.data, adjudication);
  const nextRoundWarnings = buildNextRoundWarnings(adjudication);
  // rating 仍按"提案影响"评估玩家本回合的策略表现，与事件本身的 delta 解耦。
  const rating = getRating(proposalImpact, gameStatus);
  const ratingText = getRatingText(rating, gameStatus);
  const summary = adjudication.aiAssessment.summary;

  const allianceChangesPayload = allianceChanges.map((change) => {
    const reaction = adjudication.allianceReactions.find((item) => {
      const state = allianceStatesResult.data?.find((row) => row.alliance_id === change.allianceId);
      return state ? findAllianceState(item.alliance, [state])?.alliance_id === change.allianceId : false;
    });

    return {
      alliance_id: change.allianceId,
      new_satisfaction: change.newSatisfaction,
      stance: change.stance,
      last_reaction: reaction?.reactionText ?? null,
    };
  });

  const eventResultsPayload = eventResults.map((eventResult) => ({
    event_id: eventResult.eventId,
    resolution_status: eventResult.resolutionStatus,
    summary: eventResult.summary,
  }));

  const { data: rpcData, error: rpcError } = await supabase.rpc('settle_round_v1', {
    p_game_id: game.id,
    p_round_number: body.roundNumber,
    p_metric_changes: metricChanges,
    p_new_world_state: newWorldState,
    p_event_results: eventResultsPayload,
    p_alliance_changes: allianceChangesPayload,
    p_next_round_warnings: nextRoundWarnings,
    p_rating: rating,
    p_rating_text: ratingText,
    p_summary: summary,
    p_game_status: gameStatus,
    p_adjudication_id: adjudicationResult.data.id,
  });

  if (rpcError) {
    console.error('SETTLE_ROUND_RPC_FAILED', rpcError);
    return errorResponse(request, 'SETTLE_ROUND_FAILED', rpcError.message, 500);
  }

  const settlementId = (rpcData as { settlement_id?: string } | null)?.settlement_id;

  if (!settlementId) {
    console.error('SETTLE_ROUND_RPC_MISSING_ID', rpcData);
    return errorResponse(request, 'SETTLE_ROUND_FAILED', '结算 RPC 未返回结算 ID。', 500);
  }

  const { data: settlementRow, error: readSettlementError } = await supabase
    .from('settlements')
    .select(SETTLEMENT_SELECT)
    .eq('id', settlementId)
    .returns<SettlementRow[]>()
    .single();

  if (readSettlementError || !settlementRow) {
    console.error('SETTLE_ROUND_READ_SETTLEMENT_FAILED', readSettlementError);
    return errorResponse(request, 'SETTLE_ROUND_FAILED', '读取已写入的结算失败。', 500);
  }

  // 回填 history_summary：把本回合的简要摘要追加进 game_sessions.history_summary，
  // 让下一回合的 generate-events / submit-proposal 能引用上 5 回合的成败模式。
  // 失败不阻塞主流程：跨回合记忆是质量增强项，不是正确性必要项。
  try {
    const historyEntry = buildHistoryEntry(
      body.roundNumber,
      eventsResult.data,
      adjudication,
      metricChanges,
      rating,
      ratingText,
    );
    const newHistorySummary = appendHistorySummary(game.history_summary ?? '', historyEntry);

    const { error: updateHistoryError } = await supabase
      .from('game_sessions')
      .update({ history_summary: newHistorySummary })
      .eq('id', game.id);

    if (updateHistoryError) {
      console.warn('SETTLE_ROUND_UPDATE_HISTORY_SUMMARY_FAILED', updateHistoryError);
    }
  } catch (historyError) {
    console.warn('SETTLE_ROUND_BUILD_HISTORY_SUMMARY_FAILED', historyError);
  }

  return successResponse(request, {
    settlement: mapSettlement(settlementRow, body.roundNumber),
    aiSource: adjudication.aiSource,
  } satisfies SettleRoundResponse);
});
