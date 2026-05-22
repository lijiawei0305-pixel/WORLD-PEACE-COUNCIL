import { EvaluateProposalOutputSchema } from '../_shared/aiSchemas.ts';
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
};

type RoundRow = {
  id: string;
  round_number: number;
};

type RoundEventRow = {
  id: string;
  title: string;
  type: EventType;
  severity: EventSeverity;
  description: string;
  involved_alliances: string[];
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
  peace_agreement
`;

const ROUND_EVENT_SELECT = `
  id,
  title,
  type,
  severity,
  description,
  involved_alliances,
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
  return adjudication.eventResolutionForecast.find((forecast) => forecast.eventTitle === event.title);
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
    .select('id, round_number')
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
  const currentWorldState = worldStateFromGame(game);
  const metricChanges = clampMetricChanges(adjudication.aiAssessment.expectedImpact);
  const proposedWorldState = applyMetricChanges(currentWorldState, metricChanges);
  const newWorldState = currentWorldState.globalTension >= 100
    ? { ...proposedWorldState, globalTension: 100 }
    : proposedWorldState;
  const gameStatus = getGameStatus(newWorldState, game.current_round);
  const eventResults = buildEventResults(eventsResult.data, adjudication);
  const allianceChanges = buildAllianceChanges(allianceStatesResult.data, adjudication);
  const nextRoundWarnings = buildNextRoundWarnings(adjudication);
  const rating = getRating(metricChanges, gameStatus);
  const ratingText = getRatingText(rating, gameStatus);
  const summary = adjudication.aiAssessment.summary;

  const { data: settlementRow, error: insertSettlementError } = await supabase
    .from('settlements')
    .insert({
      game_id: game.id,
      round_id: round.id,
      adjudication_id: adjudicationResult.data.id,
      metric_changes: metricChanges,
      new_world_state: newWorldState,
      event_results: eventResults,
      alliance_changes: allianceChanges,
      next_round_warnings: nextRoundWarnings,
      rating: String(rating),
      rating_text: ratingText,
      summary,
      game_status_after: gameStatus,
    })
    .select(SETTLEMENT_SELECT)
    .returns<SettlementRow[]>()
    .single();

  if (insertSettlementError || !settlementRow) {
    console.error('SETTLE_ROUND_INSERT_SETTLEMENT_FAILED', insertSettlementError);
    return errorResponse(request, 'SETTLE_ROUND_FAILED', '保存回合结算失败。', 500);
  }

  for (const change of allianceChanges) {
    const reaction = adjudication.allianceReactions.find((item) => {
      const state = allianceStatesResult.data?.find((row) => row.alliance_id === change.allianceId);
      return state ? findAllianceState(item.alliance, [state])?.alliance_id === change.allianceId : false;
    });

    const { error: updateAllianceError } = await supabase
      .from('game_alliance_states')
      .update({
        satisfaction: change.newSatisfaction,
        stance: change.stance,
        last_reaction: reaction?.reactionText ?? null,
      })
      .eq('game_id', game.id)
      .eq('alliance_id', change.allianceId);

    if (updateAllianceError) {
      console.error('SETTLE_ROUND_UPDATE_ALLIANCE_FAILED', updateAllianceError);
      return errorResponse(request, 'SETTLE_ROUND_FAILED', '更新联盟状态失败。', 500);
    }
  }

  for (const eventResult of eventResults) {
    const { error: updateEventError } = await supabase
      .from('round_events')
      .update({
        resolution_status: eventResult.resolutionStatus,
        result_text: eventResult.summary,
      })
      .eq('id', eventResult.eventId);

    if (updateEventError) {
      console.error('SETTLE_ROUND_UPDATE_EVENT_FAILED', updateEventError);
      return errorResponse(request, 'SETTLE_ROUND_FAILED', '更新事件结算状态失败。', 500);
    }
  }

  const { error: updateRoundError } = await supabase
    .from('rounds')
    .update({
      stage: 'ROUND_SETTLEMENT',
      ending_world_state: newWorldState,
      settled_at: new Date().toISOString(),
    })
    .eq('id', round.id);

  if (updateRoundError) {
    console.error('SETTLE_ROUND_UPDATE_ROUND_FAILED', updateRoundError);
    return errorResponse(request, 'SETTLE_ROUND_FAILED', '更新回合结算状态失败。', 500);
  }

  const { error: updateGameError } = await supabase
    .from('game_sessions')
    .update({
      global_tension: newWorldState.globalTension,
      world_stability: newWorldState.worldStability,
      ai_risk: newWorldState.aiRisk,
      economic_pressure: newWorldState.economicPressure,
      humanitarian_crisis: newWorldState.humanitarianCrisis,
      peace_agreement: newWorldState.peaceAgreement,
      status: gameStatus,
      current_stage: 'ROUND_SETTLEMENT',
      completed_at: gameStatus === 'ACTIVE' ? null : new Date().toISOString(),
    })
    .eq('id', game.id);

  if (updateGameError) {
    console.error('SETTLE_ROUND_UPDATE_GAME_FAILED', updateGameError);
    return errorResponse(request, 'SETTLE_ROUND_FAILED', '更新游戏结算状态失败。', 500);
  }

  return successResponse(request, {
    settlement: mapSettlement(settlementRow, body.roundNumber),
  } satisfies SettleRoundResponse);
});
