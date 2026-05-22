import { generateEventsWithAI } from '../_shared/aiClient.ts';
import { handleOptions } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { applyMetricChanges, clampMetricChanges } from '../_shared/ruleEngine.ts';
import { createServiceRoleClient } from '../_shared/supabaseClient.ts';
import type {
  AllianceState,
  EventResolutionStatus,
  EventSeverity,
  EventType,
  GameStatus,
  MetricChanges,
  RoundEvent,
  RoundStage,
  WorldMetricKey,
  WorldState,
} from '../_shared/types.ts';

type GenerateEventsAIOutput = Awaited<ReturnType<typeof generateEventsWithAI>>;

type GenerateEventsRequest = {
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
  stage: RoundStage;
  after_events_world_state: WorldState | null;
  briefing: string | null;
  priority_issue: string | null;
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
  potential_impact: MetricChanges;
  recommended_actions: string[];
  unresolved_consequence: string | null;
  resolution_status: EventResolutionStatus;
};

type GenerateEventsResponse = {
  events: RoundEvent[];
  worldState: WorldState;
  roundBriefing: string;
  priorityIssue: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TENSION_CEILING = 95;
const WORLD_METRIC_KEYS: WorldMetricKey[] = [
  'globalTension',
  'worldStability',
  'aiRisk',
  'economicPressure',
  'humanitarianCrisis',
  'peaceAgreement',
];

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

const ROUND_SELECT = `
  id,
  round_number,
  stage,
  after_events_world_state,
  briefing,
  priority_issue
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

async function parseRequestBody(request: Request): Promise<GenerateEventsRequest | null> {
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
    potentialImpact: row.potential_impact,
    recommendedActions: row.recommended_actions,
    unresolvedConsequence: row.unresolved_consequence ?? '',
    resolutionStatus: row.resolution_status,
  };
}

function aggregatePotentialImpact(events: Array<{ potentialImpact: MetricChanges }>): MetricChanges {
  const total = events.reduce<MetricChanges>((changes, event) => {
    for (const key of WORLD_METRIC_KEYS) {
      const value = event.potentialImpact[key];

      if (typeof value === 'number') {
        changes[key] = (changes[key] ?? 0) + value;
      }
    }

    return changes;
  }, {});

  return clampMetricChanges(total);
}

function applyEventImpact(worldState: WorldState, events: Array<{ potentialImpact: MetricChanges }>): WorldState {
  const afterEventsWorldState = applyMetricChanges(worldState, aggregatePotentialImpact(events));

  return {
    ...afterEventsWorldState,
    globalTension: Math.min(afterEventsWorldState.globalTension, EVENT_TENSION_CEILING),
  };
}

function buildResponse(
  events: RoundEvent[],
  worldState: WorldState,
  roundBriefing: string | null,
  priorityIssue: string | null,
): GenerateEventsResponse {
  return {
    events,
    worldState,
    roundBriefing: roundBriefing ?? '',
    priorityIssue: priorityIssue ?? '',
  };
}

async function readExistingEvents(
  supabase: ReturnType<typeof createServiceRoleClient>,
  roundId: string,
): Promise<{ events: RoundEventRow[]; error: unknown | null }> {
  const { data, error } = await supabase
    .from('round_events')
    .select(ROUND_EVENT_SELECT)
    .eq('round_id', roundId)
    .order('created_at', { ascending: true })
    .returns<RoundEventRow[]>();

  return {
    events: data ?? [],
    error,
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
    return errorResponse(request, 'UNAUTHORIZED', '请先登录后再生成回合事件。', 401);
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
    console.error('GENERATE_EVENTS_GAME_QUERY_FAILED', gameError);
    return errorResponse(request, 'GENERATE_EVENTS_FAILED', '读取游戏失败，请稍后重试。', 500);
  }

  if (!game) {
    return errorResponse(request, 'GAME_NOT_FOUND', '没有找到这局游戏。', 404);
  }

  if (game.user_id !== userId) {
    return errorResponse(request, 'FORBIDDEN', '你没有权限操作这局游戏。', 403);
  }

  if (game.current_stage !== 'RANDOM_EVENT') {
    return errorResponse(request, 'INVALID_STAGE', '当前阶段不能生成随机事件。', 409);
  }

  if (game.current_round !== body.roundNumber) {
    return errorResponse(request, 'INVALID_ROUND', '请求回合不是当前回合。', 409);
  }

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select(ROUND_SELECT)
    .eq('game_id', game.id)
    .eq('round_number', body.roundNumber)
    .returns<RoundRow[]>()
    .maybeSingle();

  if (roundError || !round) {
    console.error('GENERATE_EVENTS_ROUND_QUERY_FAILED', roundError);
    return errorResponse(request, 'ROUND_NOT_FOUND', '没有找到当前回合。', 404);
  }

  const existingEventsResult = await readExistingEvents(supabase, round.id);

  if (existingEventsResult.error) {
    console.error('GENERATE_EVENTS_EXISTING_EVENTS_QUERY_FAILED', existingEventsResult.error);
    return errorResponse(request, 'GENERATE_EVENTS_FAILED', '读取已有事件失败。', 500);
  }

  if (existingEventsResult.events.length > 0) {
    return successResponse(
      request,
      buildResponse(
        existingEventsResult.events.map(mapRoundEvent),
        round.after_events_world_state ?? worldStateFromGame(game),
        round.briefing,
        round.priority_issue,
      ),
    );
  }

  const { data: allianceRows, error: allianceError } = await supabase
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
    .order('created_at', { ascending: true })
    .returns<GameAllianceStateRow[]>();

  if (allianceError || !allianceRows) {
    console.error('GENERATE_EVENTS_ALLIANCES_QUERY_FAILED', allianceError);
    return errorResponse(request, 'GENERATE_EVENTS_FAILED', '读取联盟状态失败。', 500);
  }

  const currentWorldState = worldStateFromGame(game);
  const allianceStates = allianceRows.map(mapAllianceState);
  const aiOutput: GenerateEventsAIOutput = await generateEventsWithAI({
    round: body.roundNumber,
    worldState: currentWorldState,
    alliances: allianceStates,
    historySummary: game.history_summary ?? '',
  });

  const afterEventsWorldState = applyEventImpact(currentWorldState, aiOutput.events);
  const eventInserts = aiOutput.events.map((event) => ({
    game_id: game.id,
    round_id: round.id,
    title: event.title,
    type: event.type,
    severity: event.severity,
    description: event.description,
    involved_alliances: event.involvedAlliances,
    potential_impact: event.potentialImpact,
    recommended_actions: event.recommendedActions,
    unresolved_consequence: event.unresolvedConsequence,
    resolution_status: 'UNCHANGED',
  }));

  const { data: insertedEvents, error: insertEventsError } = await supabase
    .from('round_events')
    .insert(eventInserts)
    .select(ROUND_EVENT_SELECT)
    .returns<RoundEventRow[]>();

  if (insertEventsError || !insertedEvents) {
    console.error('GENERATE_EVENTS_INSERT_EVENTS_FAILED', insertEventsError);
    return errorResponse(request, 'GENERATE_EVENTS_FAILED', '保存回合事件失败。', 500);
  }

  const { error: updateRoundError } = await supabase
    .from('rounds')
    .update({
      after_events_world_state: afterEventsWorldState,
      briefing: aiOutput.roundBriefing,
      priority_issue: aiOutput.priorityIssue,
    })
    .eq('id', round.id);

  if (updateRoundError) {
    console.error('GENERATE_EVENTS_UPDATE_ROUND_FAILED', updateRoundError);
    return errorResponse(request, 'GENERATE_EVENTS_FAILED', '保存事件后的回合状态失败。', 500);
  }

  const { error: updateGameError } = await supabase
    .from('game_sessions')
    .update({
      global_tension: afterEventsWorldState.globalTension,
      world_stability: afterEventsWorldState.worldStability,
      ai_risk: afterEventsWorldState.aiRisk,
      economic_pressure: afterEventsWorldState.economicPressure,
      humanitarian_crisis: afterEventsWorldState.humanitarianCrisis,
      peace_agreement: afterEventsWorldState.peaceAgreement,
    })
    .eq('id', game.id);

  if (updateGameError) {
    console.error('GENERATE_EVENTS_UPDATE_GAME_FAILED', updateGameError);
    return errorResponse(request, 'GENERATE_EVENTS_FAILED', '同步游戏世界状态失败。', 500);
  }

  return successResponse(
    request,
    buildResponse(insertedEvents.map(mapRoundEvent), afterEventsWorldState, aiOutput.roundBriefing, aiOutput.priorityIssue),
  );
});
