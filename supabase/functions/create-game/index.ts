import { handleOptions } from '../_shared/cors.ts';
import { INITIAL_ALLIANCE_STATES, INITIAL_WORLD_STATE } from '../_shared/gameConstants.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { createServiceRoleClient } from '../_shared/supabaseClient.ts';
import type { AllianceState, GameStatus, RoundStage, WorldState } from '../_shared/types.ts';

type GameSessionRow = {
  id: string;
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
  stage: RoundStage;
  starting_world_state: WorldState;
  after_events_world_state: WorldState | null;
  ending_world_state: WorldState | null;
  briefing: string | null;
  priority_issue: string | null;
  created_at: string;
  updated_at: string;
  settled_at: string | null;
};

type GameAllianceStateRow = {
  id: string;
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

type CreateGameSnapshot = {
  game: {
    id: string;
    status: GameStatus;
    stage: RoundStage;
    currentRound: number;
    maxRounds: number;
    createdAt: string;
    updatedAt: string;
    endedAt: string | null;
  };
  worldState: WorldState;
  alliances: AllianceState[];
  currentRound: {
    id: string;
    roundNumber: number;
    stage: RoundStage;
    startingWorldState: WorldState;
    afterEventsWorldState: WorldState | null;
    endingWorldState: WorldState | null;
    briefing: string | null;
    priorityIssue: string | null;
    createdAt: string;
    updatedAt: string;
    settledAt: string | null;
  };
  events: [];
  proposal: null;
  adjudication: null;
  settlement: null;
};

const CREATE_GAME_SELECT = `
  id,
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

const ROUND_SELECT = `
  id,
  round_number,
  stage,
  starting_world_state,
  after_events_world_state,
  ending_world_state,
  briefing,
  priority_issue,
  created_at,
  updated_at,
  settled_at
`;

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  return authorization.slice('Bearer '.length).trim() || null;
}

function mapWorldState(game: GameSessionRow): WorldState {
  return {
    globalTension: game.global_tension,
    worldStability: game.world_stability,
    aiRisk: game.ai_risk,
    economicPressure: game.economic_pressure,
    humanitarianCrisis: game.humanitarian_crisis,
    peaceAgreement: game.peace_agreement,
  };
}

function mapRound(round: RoundRow): CreateGameSnapshot['currentRound'] {
  return {
    id: round.id,
    roundNumber: round.round_number,
    stage: round.stage,
    startingWorldState: round.starting_world_state,
    afterEventsWorldState: round.after_events_world_state,
    endingWorldState: round.ending_world_state,
    briefing: round.briefing,
    priorityIssue: round.priority_issue,
    createdAt: round.created_at,
    updatedAt: round.updated_at,
    settledAt: round.settled_at,
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

function buildSnapshot(
  game: GameSessionRow,
  round: RoundRow,
  allianceRows: GameAllianceStateRow[],
): CreateGameSnapshot {
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
    worldState: mapWorldState(game),
    alliances: allianceRows.map(mapAllianceState),
    currentRound: mapRound(round),
    events: [],
    proposal: null,
    adjudication: null,
    settlement: null,
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
    return errorResponse(request, 'UNAUTHORIZED', '请先登录后再创建游戏。', 401);
  }

  const supabase = createServiceRoleClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const userId = userData.user?.id;

  if (userError || !userId) {
    return errorResponse(request, 'UNAUTHORIZED', '登录状态无效，请重新登录。', 401);
  }

  let createdGameId: string | null = null;

  try {
    const { data: game, error: gameError } = await supabase
      .from('game_sessions')
      .insert({
        user_id: userId,
        status: 'ACTIVE',
        current_round: 1,
        max_rounds: 20,
        current_stage: 'RANDOM_EVENT',
        global_tension: INITIAL_WORLD_STATE.globalTension,
        world_stability: INITIAL_WORLD_STATE.worldStability,
        ai_risk: INITIAL_WORLD_STATE.aiRisk,
        economic_pressure: INITIAL_WORLD_STATE.economicPressure,
        humanitarian_crisis: INITIAL_WORLD_STATE.humanitarianCrisis,
        peace_agreement: INITIAL_WORLD_STATE.peaceAgreement,
        history_summary: '',
      })
      .select(CREATE_GAME_SELECT)
      .returns<GameSessionRow[]>()
      .single();

    if (gameError || !game) {
      throw gameError ?? new Error('Game insert returned no row.');
    }

    createdGameId = game.id;

    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .insert({
        game_id: game.id,
        round_number: 1,
        stage: 'RANDOM_EVENT',
        starting_world_state: INITIAL_WORLD_STATE,
      })
      .select(ROUND_SELECT)
      .returns<RoundRow[]>()
      .single();

    if (roundError || !round) {
      throw roundError ?? new Error('Round insert returned no row.');
    }

    const allianceInserts = INITIAL_ALLIANCE_STATES.map((allianceState) => ({
      game_id: game.id,
      alliance_id: allianceState.allianceId,
      stance: allianceState.stance,
      satisfaction: allianceState.satisfaction,
      current_demand: allianceState.currentDemand,
      pressure_tags: allianceState.pressureTags,
      last_reaction: allianceState.lastReaction,
    }));

    const { data: allianceRows, error: alliancesError } = await supabase
      .from('game_alliance_states')
      .insert(allianceInserts)
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
            name
          )
        `,
      )
      .returns<GameAllianceStateRow[]>();

    if (alliancesError || !allianceRows) {
      throw alliancesError ?? new Error('Alliance state insert returned no rows.');
    }

    return successResponse(request, buildSnapshot(game, round, allianceRows), 201);
  } catch (error) {
    console.error('CREATE_GAME_FAILED', error);

    if (createdGameId) {
      await supabase.from('game_sessions').delete().eq('id', createdGameId);
    }

    return errorResponse(request, 'CREATE_GAME_FAILED', '创建游戏失败，请稍后重试。', 500);
  }
});
