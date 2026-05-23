import { evaluateProposalWithAI } from '../_shared/aiClient.ts';
import { PROMPT_VERSION } from '../_shared/aiPrompts.ts';
import { EvaluateProposalOutputSchema, type AiSource } from '../_shared/aiSchemas.ts';
import { handleOptions } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { createServiceRoleClient } from '../_shared/supabaseClient.ts';
import type {
  AllianceState,
  DiplomaticProposal,
  EventResolutionStatus,
  EventSeverity,
  EventType,
  GameStatus,
  MetricChanges,
  RoundEvent,
  RoundStage,
  WorldState,
} from '../_shared/types.ts';

type EvaluateProposalOutput = ReturnType<typeof EvaluateProposalOutputSchema.parse>;

type SubmitProposalRequest = {
  gameId: string;
  roundNumber: number;
  proposalText: string;
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
  stage: RoundStage;
};

type AllianceRow = {
  id: string;
  name: string;
  short_name: string | null;
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

type ProposalRow = {
  id: string;
  proposal_text: string;
  mentioned_alliances: string[];
  action_types: string[];
  submitted_at: string;
};

type SubmitProposalResponse = {
  proposal: DiplomaticProposal;
  adjudication: EvaluateProposalOutput;
  currentStage: 'AI_ADJUDICATION';
  aiSource: AiSource;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ACTION_TYPE_KEYWORDS: Array<{ actionType: string; keywords: string[] }> = [
  { actionType: '谈判', keywords: ['谈判', '会谈', '协商', '磋商', '对话'] },
  { actionType: '交换条件', keywords: ['交换条件', '条件交换', '互换', '对价'] },
  { actionType: '让步', keywords: ['让步', '妥协', '缓和立场'] },
  { actionType: '调查', keywords: ['调查', '核查', '审查', '溯源', '观察员'] },
  { actionType: '制裁', keywords: ['制裁', '限制', '禁运', '冻结'] },
  { actionType: '援助', keywords: ['援助', '救援', '基金', '人道', '粮食支援'] },
  { actionType: '联合项目', keywords: ['联合项目', '共同项目', '共建', '合作项目', '建立机制', '军事热线'] },
  { actionType: '紧急峰会', keywords: ['紧急峰会', '峰会', '特别会议', '部长会议'] },
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

function isDatabaseCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

async function parseRequestBody(request: Request): Promise<SubmitProposalRequest | null> {
  const body: unknown = await request.json().catch(() => null);

  if (
    !isRecord(body) ||
    typeof body.gameId !== 'string' ||
    !UUID_PATTERN.test(body.gameId) ||
    typeof body.roundNumber !== 'number' ||
    !Number.isInteger(body.roundNumber) ||
    body.roundNumber < 1 ||
    body.roundNumber > 20 ||
    typeof body.proposalText !== 'string'
  ) {
    return null;
  }

  return {
    gameId: body.gameId,
    roundNumber: body.roundNumber,
    proposalText: body.proposalText.trim(),
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

function mapProposal(row: ProposalRow): DiplomaticProposal {
  return {
    id: row.id,
    proposalText: row.proposal_text,
    mentionedAlliances: row.mentioned_alliances,
    actionTypes: row.action_types,
    submittedAt: row.submitted_at,
  };
}

function parseMentionTokens(proposalText: string): string[] {
  const matches = proposalText.matchAll(/@([^\s@,，.。;；:：!！?？)）(（]+)/g);
  return [...matches].map((match) => match[1].trim()).filter(Boolean);
}

function parseMentionedAlliances(proposalText: string, alliances: AllianceRow[]): string[] {
  const mentionTokens = parseMentionTokens(proposalText);
  const normalizedToAllianceId = new Map<string, string>();

  for (const alliance of alliances) {
    normalizedToAllianceId.set(alliance.id.toLowerCase(), alliance.id);
    normalizedToAllianceId.set(alliance.name.toLowerCase(), alliance.id);

    if (alliance.short_name) {
      normalizedToAllianceId.set(alliance.short_name.toLowerCase(), alliance.id);
    }
  }

  return [...new Set(mentionTokens.flatMap((token) => {
    const exactMatch = normalizedToAllianceId.get(token.toLowerCase());

    if (exactMatch) {
      return [exactMatch];
    }

    const fuzzyMatch = alliances.find((alliance) => token.includes(alliance.name) || alliance.name.includes(token));
    return fuzzyMatch ? [fuzzyMatch.id] : [];
  }))];
}

function parseActionTypes(proposalText: string): string[] {
  return ACTION_TYPE_KEYWORDS
    .filter(({ keywords }) => keywords.some((keyword) => proposalText.includes(keyword)))
    .map(({ actionType }) => actionType);
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
    return errorResponse(request, 'UNAUTHORIZED', '请先登录后再提交外交提案。', 401);
  }

  const body = await parseRequestBody(request);

  if (!body) {
    return errorResponse(request, 'INVALID_REQUEST', '请求体必须包含合法的 gameId、roundNumber 和 proposalText。', 400);
  }

  if (body.proposalText.trim().length < 8) {
    return errorResponse(request, 'PROPOSAL_TOO_SHORT', '提案不能少于8个字', 400);
  }

  if (body.proposalText.length > 2000) {
    return errorResponse(request, 'PROPOSAL_TOO_LONG', '提案不能超过2000字', 400);
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
    console.error('SUBMIT_PROPOSAL_GAME_QUERY_FAILED', gameError);
    return errorResponse(request, 'SUBMIT_PROPOSAL_FAILED', '读取游戏失败，请稍后重试。', 500);
  }

  if (!game) {
    return errorResponse(request, 'GAME_NOT_FOUND', '没有找到这局游戏。', 404);
  }

  if (game.user_id !== userId) {
    return errorResponse(request, 'FORBIDDEN', '你没有权限操作这局游戏。', 403);
  }

  if (game.status !== 'ACTIVE') {
    return errorResponse(request, 'GAME_NOT_ACTIVE', '这局游戏已经结束，不能提交提案。', 409);
  }

  if (game.current_stage !== 'DIPLOMATIC_PROPOSAL') {
    return errorResponse(request, 'INVALID_STAGE', '当前阶段不能提交外交提案。', 409);
  }

  if (game.current_round !== body.roundNumber) {
    return errorResponse(request, 'INVALID_ROUND', '请求回合不是当前回合。', 409);
  }

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('id, stage')
    .eq('game_id', game.id)
    .eq('round_number', body.roundNumber)
    .returns<RoundRow[]>()
    .maybeSingle();

  if (roundError || !round) {
    console.error('SUBMIT_PROPOSAL_ROUND_QUERY_FAILED', roundError);
    return errorResponse(request, 'ROUND_NOT_FOUND', '没有找到当前回合。', 404);
  }

  const { data: existingProposal, error: existingProposalError } = await supabase
    .from('proposals')
    .select('id')
    .eq('round_id', round.id)
    .maybeSingle();

  if (existingProposalError) {
    console.error('SUBMIT_PROPOSAL_EXISTING_QUERY_FAILED', existingProposalError);
    return errorResponse(request, 'SUBMIT_PROPOSAL_FAILED', '检查已有提案失败。', 500);
  }

  if (existingProposal) {
    return errorResponse(request, 'PROPOSAL_ALREADY_SUBMITTED', '当前回合已经提交过外交提案。', 409);
  }

  const [
    alliancesResult,
    allianceStatesResult,
    eventsResult,
  ] = await Promise.all([
    supabase.from('alliances').select('id, name, short_name').returns<AllianceRow[]>(),
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
      .select(ROUND_EVENT_SELECT)
      .eq('round_id', round.id)
      .order('created_at', { ascending: true })
      .returns<RoundEventRow[]>(),
  ]);

  if (alliancesResult.error || !alliancesResult.data) {
    console.error('SUBMIT_PROPOSAL_ALLIANCES_QUERY_FAILED', alliancesResult.error);
    return errorResponse(request, 'SUBMIT_PROPOSAL_FAILED', '读取联盟列表失败。', 500);
  }

  if (allianceStatesResult.error || !allianceStatesResult.data) {
    console.error('SUBMIT_PROPOSAL_ALLIANCE_STATES_QUERY_FAILED', allianceStatesResult.error);
    return errorResponse(request, 'SUBMIT_PROPOSAL_FAILED', '读取联盟状态失败。', 500);
  }

  if (eventsResult.error || !eventsResult.data) {
    console.error('SUBMIT_PROPOSAL_EVENTS_QUERY_FAILED', eventsResult.error);
    return errorResponse(request, 'SUBMIT_PROPOSAL_FAILED', '读取回合事件失败。', 500);
  }

  if (eventsResult.data.length === 0) {
    return errorResponse(request, 'ROUND_EVENTS_REQUIRED', '提交提案前必须先生成随机事件。', 409);
  }

  const mentionedAlliances = parseMentionedAlliances(body.proposalText, alliancesResult.data);
  const actionTypes = parseActionTypes(body.proposalText);

  const { data: proposal, error: insertProposalError } = await supabase
    .from('proposals')
    .insert({
      game_id: game.id,
      round_id: round.id,
      user_id: userId,
      proposal_text: body.proposalText,
      mentioned_alliances: mentionedAlliances,
      action_types: actionTypes,
    })
    .select('id, proposal_text, mentioned_alliances, action_types, submitted_at')
    .returns<ProposalRow[]>()
    .single();

  if (insertProposalError || !proposal) {
    console.error('SUBMIT_PROPOSAL_INSERT_FAILED', insertProposalError);

    if (isDatabaseCode(insertProposalError, '23505')) {
      return errorResponse(request, 'PROPOSAL_ALREADY_SUBMITTED', '当前回合已经提交过外交提案。', 409);
    }

    return errorResponse(request, 'SUBMIT_PROPOSAL_FAILED', '保存外交提案失败。', 500);
  }

  const diplomaticProposal = mapProposal(proposal);
  const adjudicationResult = await evaluateProposalWithAI({
    round: body.roundNumber,
    worldState: worldStateFromGame(game),
    alliances: allianceStatesResult.data.map(mapAllianceState),
    events: eventsResult.data.map(mapRoundEvent),
    proposal: diplomaticProposal,
    historySummary: game.history_summary ?? '',
  });
  const rawAiString = adjudicationResult.rawString;
  const validation = EvaluateProposalOutputSchema.safeParse(adjudicationResult.output);

  if (!validation.success) {
    console.error('SUBMIT_PROPOSAL_AI_VALIDATION_FAILED', validation.error);
    await supabase.from('proposals').delete().eq('id', proposal.id);
    return errorResponse(request, 'SUBMIT_PROPOSAL_FAILED', 'AI 裁定格式校验失败。', 500);
  }

  const validatedAdjudication = validation.data;
  const { error: insertAdjudicationError } = await supabase.from('ai_adjudications').insert({
    game_id: game.id,
    round_id: round.id,
    proposal_id: proposal.id,
    model: adjudicationResult.model,
    duration_ms: adjudicationResult.durationMs,
    prompt_version: PROMPT_VERSION,
    raw_output: rawAiString ?? { mock: true },
    parsed_output: validatedAdjudication,
    success_probability: validatedAdjudication.aiAssessment.successProbability,
    expected_impact: validatedAdjudication.aiAssessment.expectedImpact,
    alliance_reactions: validatedAdjudication.allianceReactions,
    event_resolution_forecast: validatedAdjudication.eventResolutionForecast,
    next_round_risks: validatedAdjudication.nextRoundRisks,
  });

  if (insertAdjudicationError) {
    console.error('SUBMIT_PROPOSAL_ADJUDICATION_INSERT_FAILED', insertAdjudicationError);
    await supabase.from('proposals').delete().eq('id', proposal.id);
    return errorResponse(request, 'SUBMIT_PROPOSAL_FAILED', '保存 AI 裁定失败。', 500);
  }

  const { error: updateGameError } = await supabase
    .from('game_sessions')
    .update({ current_stage: 'AI_ADJUDICATION' })
    .eq('id', game.id)
    .eq('current_stage', 'DIPLOMATIC_PROPOSAL');

  if (updateGameError) {
    console.error('SUBMIT_PROPOSAL_UPDATE_GAME_STAGE_FAILED', updateGameError);
    await supabase.from('proposals').delete().eq('id', proposal.id);
    return errorResponse(request, 'SUBMIT_PROPOSAL_FAILED', '推进游戏阶段失败。', 500);
  }

  const { error: updateRoundError } = await supabase
    .from('rounds')
    .update({ stage: 'AI_ADJUDICATION' })
    .eq('id', round.id);

  if (updateRoundError) {
    console.error('SUBMIT_PROPOSAL_UPDATE_ROUND_STAGE_FAILED', updateRoundError);
    await supabase.from('game_sessions').update({ current_stage: 'DIPLOMATIC_PROPOSAL' }).eq('id', game.id);
    await supabase.from('proposals').delete().eq('id', proposal.id);
    return errorResponse(request, 'SUBMIT_PROPOSAL_FAILED', '推进回合阶段失败。', 500);
  }

  return successResponse(
    request,
    {
      proposal: diplomaticProposal,
      adjudication: validatedAdjudication,
      currentStage: 'AI_ADJUDICATION',
      aiSource: validatedAdjudication.aiSource,
    } satisfies SubmitProposalResponse,
    201,
  );
});
