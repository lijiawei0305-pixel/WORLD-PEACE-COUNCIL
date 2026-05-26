import { handleOptions } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { createServiceRoleClient } from '../_shared/supabaseClient.ts';
import type {
  AIAdjudication,
  AllianceState,
  DiplomaticProposal,
  EventResolutionStatus,
  EventSeverity,
  EventType,
  GameSnapshot,
  GameStatus,
  MetricChanges,
  RoundEvent,
  RoundSettlement,
  RoundStage,
  WorldState,
} from '../_shared/types.ts';

type GameSessionRow = {
  id: string;
  user_id: string | null;
  status: GameStatus;
  current_round: number;
  max_rounds: number;
  current_stage: RoundStage;
  global_tension: number;
  world_stability: number;
  ai_risk: number;
  economic_pressure: number;
  humanitarian_crisis: number;
  peace_agreement: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type RoundRow = {
  id: string;
  round_number: number;
};

type GameAllianceStateRow = {
  alliance_id: string;
  stance: string;
  satisfaction: number;
  current_demand: string | null;
  pressure_tags: string[] | null;
  last_reaction: string | null;
  alliances: {
    name: string;
  } | null;
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
  mentioned_alliances: string[] | null;
  action_types: string[] | null;
  submitted_at: string;
};

type AIAdjudicationRow = {
  parsed_output: AIAdjudication;
};

type SettlementRow = {
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

type GetGameStateRequest = {
  gameId: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const GAME_SELECT = `
  id,
  user_id,
  status,
  current_round,
  max_rounds,
  current_stage,
  global_tension,
  world_stability,
  ai_risk,
  economic_pressure,
  humanitarian_crisis,
  peace_agreement,
  created_at,
  updated_at,
  completed_at
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

async function parseRequestBody(request: Request): Promise<GetGameStateRequest | null> {
  const body: unknown = await request.json().catch(() => null);

  if (!isRecord(body) || typeof body.gameId !== 'string' || !UUID_PATTERN.test(body.gameId)) {
    return null;
  }

  return { gameId: body.gameId };
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

function mapAllianceState(row: GameAllianceStateRow): AllianceState {
  return {
    allianceId: row.alliance_id,
    allianceName: row.alliances?.name ?? row.alliance_id,
    stance: row.stance,
    satisfaction: row.satisfaction,
    currentDemand: row.current_demand ?? '',
    pressureTags: row.pressure_tags ?? [],
    lastReaction: row.last_reaction,
  };
}

function mapRoundEvent(row: RoundEventRow): RoundEvent {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    severity: row.severity,
    description: row.description,
    involvedAlliances: row.involved_alliances,
    involvedCountries: row.involved_countries ?? [],
    potentialImpact: row.potential_impact,
    recommendedActions: row.recommended_actions,
    unresolvedConsequence: row.unresolved_consequence ?? '',
    resolutionStatus: row.resolution_status,
  };
}

function mapProposal(row: ProposalRow | null): DiplomaticProposal | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    proposalText: row.proposal_text,
    mentionedAlliances: row.mentioned_alliances ?? [],
    actionTypes: row.action_types ?? [],
    submittedAt: row.submitted_at,
  };
}

function parseRating(rating: string | null): number {
  if (!rating) {
    return 0;
  }

  const parsedRating = Number.parseInt(rating, 10);
  return Number.isNaN(parsedRating) ? 0 : Math.min(Math.max(parsedRating, 0), 100);
}

function mapSettlement(row: SettlementRow | null, roundNumber: number): RoundSettlement | null {
  if (!row) {
    return null;
  }

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

function buildSnapshot({
  game,
  allianceRows,
  eventRows,
  proposal,
  adjudication,
  settlement,
}: {
  game: GameSessionRow;
  allianceRows: GameAllianceStateRow[];
  eventRows: RoundEventRow[];
  proposal: ProposalRow | null;
  adjudication: AIAdjudicationRow | null;
  settlement: SettlementRow | null;
}): GameSnapshot {
  return {
    game: {
      id: game.id,
      status: game.status,
      stage: game.current_stage,
      currentRound: game.current_round,
      maxRounds: game.max_rounds,
      createdAt: game.created_at,
      updatedAt: game.updated_at,
      endedAt: game.completed_at,
    },
    worldState: worldStateFromGame(game),
    alliances: allianceRows.map(mapAllianceState),
    currentRound: game.current_round,
    events: eventRows.map(mapRoundEvent),
    proposal: mapProposal(proposal),
    adjudication: adjudication?.parsed_output ?? null,
    settlement: mapSettlement(settlement, game.current_round),
  };
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
    return errorResponse(request, 'UNAUTHORIZED', '请先登录后再读取游戏状态。', 401);
  }

  const body = await parseRequestBody(request);

  if (!body) {
    return errorResponse(request, 'INVALID_REQUEST', '请求体必须包含合法的 gameId。', 400);
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
    console.error('GET_GAME_STATE_GAME_QUERY_FAILED', gameError);
    return errorResponse(request, 'GET_GAME_STATE_FAILED', '读取游戏状态失败，请稍后重试。', 500);
  }

  if (!game) {
    return errorResponse(request, 'GAME_NOT_FOUND', '没有找到这局游戏。', 404);
  }

  if (game.user_id !== userId) {
    return errorResponse(request, 'FORBIDDEN', '你没有权限读取这局游戏。', 403);
  }

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('id, round_number')
    .eq('game_id', game.id)
    .eq('round_number', game.current_round)
    .returns<RoundRow[]>()
    .maybeSingle();

  if (roundError || !round) {
    console.error('GET_GAME_STATE_ROUND_QUERY_FAILED', roundError);
    return errorResponse(request, 'GET_GAME_STATE_FAILED', '读取当前回合失败。', 500);
  }

  const [
    allianceResult,
    eventResult,
    proposalResult,
    adjudicationResult,
    settlementResult,
  ] = await Promise.all([
    supabase
      .from('game_alliance_states')
      .select(
        `
          alliance_id,
          stance,
          satisfaction,
          current_demand,
          pressure_tags,
          last_reaction,
          alliances (
            name
          )
        `,
      )
      .eq('game_id', game.id)
      .returns<GameAllianceStateRow[]>(),
    supabase
      .from('round_events')
      .select(
        `
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
        `,
      )
      .eq('round_id', round.id)
      .order('created_at', { ascending: true })
      .returns<RoundEventRow[]>(),
    supabase
      .from('proposals')
      .select(
        `
          id,
          proposal_text,
          mentioned_alliances,
          action_types,
          submitted_at
        `,
      )
      .eq('round_id', round.id)
      .returns<ProposalRow[]>()
      .maybeSingle(),
    supabase
      .from('ai_adjudications')
      .select('parsed_output')
      .eq('round_id', round.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .returns<AIAdjudicationRow[]>()
      .maybeSingle(),
    supabase
      .from('settlements')
      .select(
        `
          metric_changes,
          new_world_state,
          event_results,
          alliance_changes,
          next_round_warnings,
          rating,
          rating_text,
          summary,
          game_status_after
        `,
      )
      .eq('round_id', round.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .returns<SettlementRow[]>()
      .maybeSingle(),
  ]);

  if (allianceResult.error) {
    console.error('GET_GAME_STATE_ALLIANCES_QUERY_FAILED', allianceResult.error);
    return errorResponse(request, 'GET_GAME_STATE_FAILED', '读取联盟状态失败。', 500);
  }

  if (eventResult.error) {
    console.error('GET_GAME_STATE_EVENTS_QUERY_FAILED', eventResult.error);
    return errorResponse(request, 'GET_GAME_STATE_FAILED', '读取回合事件失败。', 500);
  }

  if (proposalResult.error) {
    console.error('GET_GAME_STATE_PROPOSAL_QUERY_FAILED', proposalResult.error);
    return errorResponse(request, 'GET_GAME_STATE_FAILED', '读取外交提案失败。', 500);
  }

  if (adjudicationResult.error) {
    console.error('GET_GAME_STATE_ADJUDICATION_QUERY_FAILED', adjudicationResult.error);
    return errorResponse(request, 'GET_GAME_STATE_FAILED', '读取 AI 裁定失败。', 500);
  }

  if (settlementResult.error) {
    console.error('GET_GAME_STATE_SETTLEMENT_QUERY_FAILED', settlementResult.error);
    return errorResponse(request, 'GET_GAME_STATE_FAILED', '读取回合结算失败。', 500);
  }

  return successResponse(
    request,
    buildSnapshot({
      game,
      allianceRows: allianceResult.data ?? [],
      eventRows: eventResult.data ?? [],
      proposal: proposalResult.data ?? null,
      adjudication: adjudicationResult.data ?? null,
      settlement: settlementResult.data ?? null,
    }),
  );
});
