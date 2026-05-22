import { handleOptions } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { createServiceRoleClient } from '../_shared/supabaseClient.ts';
import type { AllianceState, GameSnapshot, GameStatus, RoundStage, WorldState } from '../_shared/types.ts';

type NextRoundRequest = {
  gameId: string;
};

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

async function parseRequestBody(request: Request): Promise<NextRoundRequest | null> {
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

function buildSnapshot(game: GameSessionRow, alliances: GameAllianceStateRow[]): GameSnapshot {
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
    alliances: alliances.map(mapAllianceState),
    currentRound: game.current_round,
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
    return errorResponse(request, 'UNAUTHORIZED', '请先登录后再进入下一回合。', 401);
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
    console.error('NEXT_ROUND_GAME_QUERY_FAILED', gameError);
    return errorResponse(request, 'NEXT_ROUND_FAILED', '读取游戏失败，请稍后重试。', 500);
  }

  if (!game) {
    return errorResponse(request, 'GAME_NOT_FOUND', '没有找到这局游戏。', 404);
  }

  if (game.user_id !== userId) {
    return errorResponse(request, 'FORBIDDEN', '你没有权限操作这局游戏。', 403);
  }

  if (game.current_stage !== 'ROUND_SETTLEMENT') {
    return errorResponse(request, 'INVALID_STAGE', '只有回合结算阶段可以进入下一回合。', 409);
  }

  if (game.status !== 'ACTIVE') {
    return errorResponse(request, 'GAME_FINISHED', '这局游戏已经结束，不能进入下一回合。', 409);
  }

  if (game.current_round >= 20) {
    return errorResponse(request, 'MAX_ROUND_REACHED', '已经到达第 20 回合，不能继续进入下一回合。', 409);
  }

  const nextRound = game.current_round + 1;
  const startingWorldState = worldStateFromGame(game);

  const { error: createRoundError } = await supabase.from('rounds').insert({
    game_id: game.id,
    round_number: nextRound,
    stage: 'RANDOM_EVENT',
    starting_world_state: startingWorldState,
  });

  if (createRoundError) {
    console.error('NEXT_ROUND_CREATE_ROUND_FAILED', createRoundError);
    return errorResponse(request, 'NEXT_ROUND_FAILED', '创建下一回合失败。', 500);
  }

  const { data: updatedGame, error: updateGameError } = await supabase
    .from('game_sessions')
    .update({
      current_round: nextRound,
      current_stage: 'RANDOM_EVENT',
    })
    .eq('id', game.id)
    .eq('current_round', game.current_round)
    .eq('current_stage', 'ROUND_SETTLEMENT')
    .select(GAME_SELECT)
    .returns<GameSessionRow[]>()
    .single();

  if (updateGameError || !updatedGame) {
    console.error('NEXT_ROUND_UPDATE_GAME_FAILED', updateGameError);
    await supabase.from('rounds').delete().eq('game_id', game.id).eq('round_number', nextRound);
    return errorResponse(request, 'NEXT_ROUND_FAILED', '更新游戏回合失败。', 500);
  }

  const { data: alliances, error: alliancesError } = await supabase
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
    .returns<GameAllianceStateRow[]>();

  if (alliancesError || !alliances) {
    console.error('NEXT_ROUND_ALLIANCES_QUERY_FAILED', alliancesError);
    return errorResponse(request, 'NEXT_ROUND_FAILED', '读取联盟状态失败。', 500);
  }

  return successResponse(request, buildSnapshot(updatedGame, alliances), 201);
});
