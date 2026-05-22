import { handleOptions } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { createServiceRoleClient } from '../_shared/supabaseClient.ts';
import type { GameStatus, RoundStage } from '../_shared/types.ts';

type AdvanceStageRequest = {
  gameId: string;
};

type GameSessionRow = {
  id: string;
  user_id: string | null;
  status: GameStatus;
  current_round: number;
  current_stage: RoundStage;
};

type RoundRow = {
  id: string;
  stage: RoundStage;
};

type AdvanceStageResponse = {
  gameId: string;
  roundNumber: number;
  previousStage: RoundStage;
  currentStage: RoundStage;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

async function parseRequestBody(request: Request): Promise<AdvanceStageRequest | null> {
  const body: unknown = await request.json().catch(() => null);

  if (!isRecord(body) || typeof body.gameId !== 'string' || !UUID_PATTERN.test(body.gameId)) {
    return null;
  }

  return { gameId: body.gameId };
}

function getNextAllowedStage(stage: RoundStage): RoundStage | null {
  if (stage === 'RANDOM_EVENT') {
    return 'SITUATION_OVERVIEW';
  }

  if (stage === 'SITUATION_OVERVIEW') {
    return 'DIPLOMATIC_PROPOSAL';
  }

  return null;
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
    return errorResponse(request, 'UNAUTHORIZED', '请先登录后再推进阶段。', 401);
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
    .select('id, user_id, status, current_round, current_stage')
    .eq('id', body.gameId)
    .returns<GameSessionRow[]>()
    .maybeSingle();

  if (gameError) {
    console.error('ADVANCE_STAGE_GAME_QUERY_FAILED', gameError);
    return errorResponse(request, 'ADVANCE_STAGE_FAILED', '读取游戏失败，请稍后重试。', 500);
  }

  if (!game) {
    return errorResponse(request, 'GAME_NOT_FOUND', '没有找到这局游戏。', 404);
  }

  if (game.user_id !== userId) {
    return errorResponse(request, 'FORBIDDEN', '你没有权限操作这局游戏。', 403);
  }

  if (game.status !== 'ACTIVE') {
    return errorResponse(request, 'GAME_NOT_ACTIVE', '这局游戏已经结束，不能继续推进阶段。', 409);
  }

  const nextStage = getNextAllowedStage(game.current_stage);

  if (!nextStage) {
    return errorResponse(request, 'INVALID_STAGE_TRANSITION', '当前阶段不能通过该接口推进。', 409);
  }

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('id, stage')
    .eq('game_id', game.id)
    .eq('round_number', game.current_round)
    .returns<RoundRow[]>()
    .maybeSingle();

  if (roundError || !round) {
    console.error('ADVANCE_STAGE_ROUND_QUERY_FAILED', roundError);
    return errorResponse(request, 'ROUND_NOT_FOUND', '没有找到当前回合。', 404);
  }

  if (game.current_stage === 'RANDOM_EVENT') {
    const { count, error: eventCountError } = await supabase
      .from('round_events')
      .select('id', { count: 'exact', head: true })
      .eq('round_id', round.id);

    if (eventCountError) {
      console.error('ADVANCE_STAGE_EVENT_COUNT_FAILED', eventCountError);
      return errorResponse(request, 'ADVANCE_STAGE_FAILED', '检查回合事件失败。', 500);
    }

    if (!count) {
      return errorResponse(request, 'ROUND_EVENTS_REQUIRED', '进入局势总览前必须先生成随机事件。', 409);
    }
  }

  const { error: updateRoundError } = await supabase
    .from('rounds')
    .update({ stage: nextStage })
    .eq('id', round.id);

  if (updateRoundError) {
    console.error('ADVANCE_STAGE_UPDATE_ROUND_FAILED', updateRoundError);
    return errorResponse(request, 'ADVANCE_STAGE_FAILED', '更新回合阶段失败。', 500);
  }

  const { error: updateGameError } = await supabase
    .from('game_sessions')
    .update({ current_stage: nextStage })
    .eq('id', game.id)
    .eq('current_stage', game.current_stage);

  if (updateGameError) {
    console.error('ADVANCE_STAGE_UPDATE_GAME_FAILED', updateGameError);
    await supabase.from('rounds').update({ stage: round.stage }).eq('id', round.id);
    return errorResponse(request, 'ADVANCE_STAGE_FAILED', '更新游戏阶段失败。', 500);
  }

  return successResponse(
    request,
    {
      gameId: game.id,
      roundNumber: game.current_round,
      previousStage: game.current_stage,
      currentStage: nextStage,
    } satisfies AdvanceStageResponse,
  );
});
