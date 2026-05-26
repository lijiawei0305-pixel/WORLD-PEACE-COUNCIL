import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type {
  AIAdjudication,
  AllianceReactionAttitude,
  GameSnapshot,
} from '../contracts/game';
import {
  AIAdjudicationSchema,
  AiSourceSchema,
  AllianceReactionAttitudeSchema,
  DiplomaticProposalSchema,
  EventResolutionStatusSchema,
  EventSeveritySchema,
  EventTypeSchema,
  GameSnapshotSchema,
  IdSchema,
  MetricChangesSchema,
  NonEmptyTextSchema,
  RoundEventSchema,
  RoundStageSchema,
  WorldStateSchema,
} from './gameSchemas';
import { getAIPromptLanguage, type Language } from './i18n';

// 8 个 Edge Function 的字面量名联合，用于约束 callEdgeFunction 入参。
type FunctionName =
  | 'create-game'
  | 'get-game-state'
  | 'generate-events'
  | 'advance-stage'
  | 'submit-proposal'
  | 'settle-round'
  | 'next-round'
  | 'alliance-map';
type RequestMethod = 'GET' | 'POST';

type EdgeFunctionOptions = {
  body?: unknown;
  method?: RequestMethod;
  requireAuth?: boolean;
};

type SupabaseConfig = {
  anonKey: string;
  projectUrl: string;
  functionsBaseUrl: string;
  url: string;
};

const UuidSchema = z.string().uuid();
const RoundNumberSchema = z.number().int().min(1).max(20);
const ProposalTextSchema = z.string().trim().min(8).max(2000);

const ApiEnvelopeSchema = z.union([
  z
    .object({
      ok: z.literal(true),
      data: z.unknown(),
    })
    .passthrough(),
  z
    .object({
      ok: z.literal(false),
      error: NonEmptyTextSchema,
      message: NonEmptyTextSchema,
    })
    .passthrough(),
]);

const GenerateEventsResponseSchema = z
  .object({
    aiSource: AiSourceSchema,
    events: z.array(RoundEventSchema),
    worldState: WorldStateSchema,
    roundBriefing: z.string(),
    priorityIssue: z.string(),
  })
  .strict();

const AdvanceStageResponseSchema = z
  .object({
    gameId: UuidSchema,
    roundNumber: RoundNumberSchema,
    previousStage: RoundStageSchema,
    currentStage: RoundStageSchema,
  })
  .strict();

const BackendProposalUnderstandingSchema = z
  .object({
    mainGoal: NonEmptyTextSchema,
    mentionedAlliances: z.array(NonEmptyTextSchema),
    actionTypes: z.array(NonEmptyTextSchema),
    targetEvents: z.array(NonEmptyTextSchema),
  })
  .strict();

const BackendAllianceReactionSchema = z
  .object({
    alliance: NonEmptyTextSchema,
    attitude: AllianceReactionAttitudeSchema,
    reactionText: NonEmptyTextSchema,
    reason: NonEmptyTextSchema,
    satisfactionDelta: z.number().int().min(-20).max(20),
  })
  .strict();

const BackendAIAssessmentSchema = z
  .object({
    successProbability: z.number().int().min(0).max(100),
    summary: NonEmptyTextSchema,
    strengths: z.array(NonEmptyTextSchema),
    weaknesses: z.array(NonEmptyTextSchema),
    expectedImpact: MetricChangesSchema,
    feasibility: z.number().min(0).max(1),
    escalationRisk: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
  })
  .strict();

const BackendEventResolutionForecastSchema = z
  .object({
    eventId: z.string().uuid(),
    resolutionStatus: EventResolutionStatusSchema,
    reason: NonEmptyTextSchema,
    expectedImpact: MetricChangesSchema,
  })
  .strict();

const NextRoundRiskSchema = z
  .object({
    title: NonEmptyTextSchema,
    type: EventTypeSchema,
    severity: EventSeveritySchema,
    description: NonEmptyTextSchema,
    involvedAlliances: z.array(IdSchema),
  })
  .strict();

const BackendEvaluateProposalOutputSchema = z
  .object({
    aiSource: AiSourceSchema,
    proposalUnderstanding: BackendProposalUnderstandingSchema,
    allianceReactions: z.array(BackendAllianceReactionSchema).min(1),
    aiAssessment: BackendAIAssessmentSchema,
    eventResolutionForecast: z.array(BackendEventResolutionForecastSchema),
    nextRoundRisks: z.array(NextRoundRiskSchema),
  })
  .strict();

const RawSubmitProposalResponseSchema = z
  .object({
    proposal: DiplomaticProposalSchema,
    adjudication: BackendEvaluateProposalOutputSchema,
    currentStage: z.literal('AI_ADJUDICATION'),
    aiSource: AiSourceSchema,
  })
  .strict();

const SubmitProposalResponseSchema = z
  .object({
    proposal: DiplomaticProposalSchema,
    adjudication: AIAdjudicationSchema,
    currentStage: z.literal('AI_ADJUDICATION'),
    aiSource: AiSourceSchema,
  })
  .strict();

const SettleRoundResponseSchema = z
  .object({
    settlement: z.unknown(),
    aiSource: AiSourceSchema.optional(),
  })
  .passthrough();

const AllianceMapResponseSchema = z
  .object({
    items: z.array(
      z
        .object({
          countryCode: NonEmptyTextSchema,
          countryName: NonEmptyTextSchema,
          cityName: NonEmptyTextSchema.nullable(),
          latitude: z.number().nullable(),
          longitude: z.number().nullable(),
          alliance: z
            .object({
              id: IdSchema,
              name: NonEmptyTextSchema,
              color: NonEmptyTextSchema,
              iconKey: NonEmptyTextSchema,
            })
            .strict()
            .nullable(),
        })
        .strict(),
    ),
  })
  .strict();

type BackendEvaluateProposalOutput = z.infer<typeof BackendEvaluateProposalOutputSchema>;

export type GenerateEventsResponse = z.infer<typeof GenerateEventsResponseSchema>;
export type AdvanceStageResponse = z.infer<typeof AdvanceStageResponseSchema>;
export type SubmitProposalResponse = z.infer<typeof SubmitProposalResponseSchema>;
export type SettleRoundResponse = z.infer<typeof SettleRoundResponseSchema>;
export type AllianceMapResponse = z.infer<typeof AllianceMapResponseSchema>;

export class ApiClientError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly status?: number;

  constructor(code: string, message: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

let cachedConfig: SupabaseConfig | null = null;
let cachedSupabaseClient: SupabaseClient | null = null;

function shouldUseSupabaseDevProxy(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return false;
  }

  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

function getSupabaseConfig(): SupabaseConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new ApiClientError(
      'MISSING_SUPABASE_ENV',
      '缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY，请先配置前端环境变量。',
    );
  }

  const normalizedUrl = supabaseUrl.replace(/\/+$/, '');
  const clientUrl = shouldUseSupabaseDevProxy()
    ? `${window.location.origin}/supabase`
    : normalizedUrl;
  cachedConfig = {
    anonKey: supabaseAnonKey,
    projectUrl: normalizedUrl,
    functionsBaseUrl: `${clientUrl}/functions/v1`,
    url: clientUrl,
  };

  return cachedConfig;
}

export function getSupabaseClient(): SupabaseClient {
  if (!cachedSupabaseClient) {
    const config = getSupabaseConfig();
    cachedSupabaseClient = createClient(config.url, config.anonKey);
  }

  return cachedSupabaseClient;
}

function validateInput<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    throw new ApiClientError('INVALID_CLIENT_INPUT', message, undefined, parsed.error);
  }

  return parsed.data;
}

function parseResponseData<T>(functionName: FunctionName, schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    throw new ApiClientError(
      'INVALID_RESPONSE_SCHEMA',
      `${functionName} 返回数据未通过前端 API Contract 校验。`,
      undefined,
      parsed.error,
    );
  }

  return parsed.data;
}

async function getAccessToken(requireAuth: boolean): Promise<string | null> {
  const { data, error } = await getSupabaseClient().auth.getSession();

  if (error) {
    throw new ApiClientError('AUTH_SESSION_FAILED', '读取 Supabase 登录状态失败。', undefined, error);
  }

  const token = data.session?.access_token ?? null;

  if (requireAuth && !token) {
    throw new ApiClientError('UNAUTHORIZED', '请先登录后再调用游戏 API。', 401);
  }

  return token;
}

async function buildHeaders(requireAuth: boolean): Promise<Record<string, string>> {
  const config = getSupabaseConfig();
  const token = await getAccessToken(requireAuth);
  const headers: Record<string, string> = {
    apikey: config.anonKey,
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function callEdgeFunction(functionName: FunctionName, options: EdgeFunctionOptions = {}): Promise<unknown> {
  const method = options.method ?? 'POST';
  const requireAuth = options.requireAuth ?? true;
  const config = getSupabaseConfig();
  const response = await fetch(`${config.functionsBaseUrl}/${functionName}`, {
    method,
    headers: await buildHeaders(requireAuth),
    body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}),
  });

  const payload: unknown = await response.json().catch(() => null);
  const envelope = ApiEnvelopeSchema.safeParse(payload);

  if (!envelope.success) {
    throw new ApiClientError(
      'INVALID_RESPONSE',
      '后端返回格式不符合统一 API Envelope。',
      response.status,
      envelope.error,
    );
  }

  if (!envelope.data.ok) {
    throw new ApiClientError(envelope.data.error, envelope.data.message, response.status);
  }

  if (!response.ok) {
    throw new ApiClientError('HTTP_ERROR', `请求失败，HTTP 状态码 ${response.status}。`, response.status);
  }

  return envelope.data.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getStringField(value: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  if (!value) {
    return undefined;
  }

  for (const key of keys) {
    const field = value[key];
    if (typeof field === 'string' && field.trim()) {
      return field;
    }
  }

  return undefined;
}

function getNumberField(value: Record<string, unknown> | undefined, ...keys: string[]): number | undefined {
  if (!value) {
    return undefined;
  }

  for (const key of keys) {
    const field = value[key];
    if (typeof field === 'number' && Number.isFinite(field)) {
      return field;
    }
  }

  return undefined;
}

function getRecordField(value: Record<string, unknown> | undefined, ...keys: string[]): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  for (const key of keys) {
    const field = value[key];
    if (isRecord(field)) {
      return field;
    }
  }

  return undefined;
}

function getArrayField(value: Record<string, unknown> | undefined, ...keys: string[]): unknown[] {
  if (!value) {
    return [];
  }

  for (const key of keys) {
    const field = value[key];
    if (Array.isArray(field)) {
      return field;
    }
  }

  return [];
}

function normalizeMetricChangesValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function normalizeSettlement(value: unknown, snapshot: Record<string, unknown>): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const events = getArrayField(snapshot, 'events').filter(isRecord);
  const alliances = getArrayField(snapshot, 'alliances').filter(isRecord);
  const eventById = new Map(events.map((event) => [getStringField(event, 'id') ?? '', event]));
  const allianceById = new Map(alliances.map((alliance) => [getStringField(alliance, 'allianceId', 'alliance_id') ?? '', alliance]));
  const eventResults = getArrayField(value, 'eventResults', 'event_results').filter(isRecord).map((eventResult) => {
    const eventId = getStringField(eventResult, 'eventId', 'event_id') ?? '';
    const event = eventById.get(eventId);

    return {
      eventId,
      title: getStringField(eventResult, 'title') ?? getStringField(event, 'title') ?? '未命名事件',
      resolutionStatus: getStringField(eventResult, 'resolutionStatus', 'resolution_status')
        ?? getStringField(event, 'resolutionStatus', 'resolution_status')
        ?? 'UNCHANGED',
      summary: getStringField(eventResult, 'summary') ?? '本事件未在本回合获得实质解决。',
      metricChanges: normalizeMetricChangesValue(
        getRecordField(eventResult, 'metricChanges', 'metric_changes'),
      ),
    };
  });
  const allianceChanges = getArrayField(value, 'allianceChanges', 'alliance_changes').filter(isRecord).map((change) => {
    const allianceId = getStringField(change, 'allianceId', 'alliance_id') ?? '';
    const alliance = allianceById.get(allianceId);

    return {
      allianceId,
      allianceName: getStringField(change, 'allianceName', 'alliance_name')
        ?? getStringField(alliance, 'allianceName', 'alliance_name')
        ?? (allianceId || '未知联盟'),
      satisfactionDelta: getNumberField(change, 'satisfactionDelta', 'satisfaction_delta') ?? 0,
      newSatisfaction: getNumberField(change, 'newSatisfaction', 'new_satisfaction')
        ?? getNumberField(alliance, 'satisfaction')
        ?? 0,
      stance: getStringField(change, 'stance') ?? getStringField(alliance, 'stance') ?? '中立',
      currentDemand: getStringField(change, 'currentDemand', 'current_demand')
        ?? getStringField(alliance, 'currentDemand', 'current_demand')
        ?? '维持现有立场。',
      pressureTags: getArrayField(change, 'pressureTags', 'pressure_tags').filter((tag): tag is string => typeof tag === 'string'),
    };
  });

  return {
    round: getNumberField(value, 'round') ?? getNumberField(snapshot, 'currentRound') ?? 1,
    summary: getStringField(value, 'summary') ?? '本回合结算完成。',
    metricChanges: normalizeMetricChangesValue(getRecordField(value, 'metricChanges', 'metric_changes')),
    newWorldState: getRecordField(value, 'newWorldState', 'new_world_state') ?? getRecordField(snapshot, 'worldState') ?? {},
    eventResults,
    allianceChanges,
    nextRoundWarnings: getArrayField(value, 'nextRoundWarnings', 'next_round_warnings').filter((warning): warning is string => typeof warning === 'string'),
    rating: getNumberField(value, 'rating') ?? 0,
    ratingText: getStringField(value, 'ratingText', 'rating_text') ?? '局势胶着',
    gameStatus: getStringField(value, 'gameStatus', 'game_status', 'game_status_after') ?? 'ACTIVE',
  };
}

function normalizeGameSnapshot(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const normalized: Record<string, unknown> = { ...value };
  const rawCurrentRound = normalized.currentRound;
  const currentRoundNumber = typeof rawCurrentRound === 'number'
    ? rawCurrentRound
    : isRecord(rawCurrentRound) && typeof rawCurrentRound.roundNumber === 'number'
      ? rawCurrentRound.roundNumber
      : null;

  if (currentRoundNumber) {
    normalized.currentRound = currentRoundNumber;

    if (isRecord(normalized.game)) {
      normalized.game = {
        ...normalized.game,
        currentRound: typeof normalized.game.currentRound === 'number'
          ? normalized.game.currentRound
          : currentRoundNumber,
      };
    }
  }

  if (normalized.adjudication !== null && normalized.adjudication !== undefined) {
    normalized.adjudication = normalizeAdjudication(normalized.adjudication);
  }

  if (normalized.settlement !== null && normalized.settlement !== undefined) {
    normalized.settlement = normalizeSettlement(normalized.settlement, normalized);
  }

  return normalized;
}

function attitudeLabel(attitude: AllianceReactionAttitude): string {
  const labels: Record<AllianceReactionAttitude, string> = {
    ACCEPT: '接受',
    ACCEPT_CONDITIONALLY: '有条件接受',
    NEUTRAL: '观望',
    CONCERNED: '担忧',
    REJECT: '拒绝',
  };

  return labels[attitude];
}

function normalizeBackendAdjudication(adjudication: BackendEvaluateProposalOutput): AIAdjudication {
  const metricImpact = adjudication.aiAssessment.expectedImpact;

  return AIAdjudicationSchema.parse({
    proposalUnderstanding: {
      summary: adjudication.proposalUnderstanding.mainGoal,
      primaryGoal: adjudication.proposalUnderstanding.mainGoal,
      keyActions: adjudication.proposalUnderstanding.actionTypes,
      targetedAlliances: adjudication.proposalUnderstanding.mentionedAlliances,
      risks: [
        ...adjudication.proposalUnderstanding.targetEvents,
        ...adjudication.aiAssessment.weaknesses,
      ],
    },
    allianceReactions: adjudication.allianceReactions.map((reaction) => ({
      allianceId: reaction.alliance,
      attitude: reaction.attitude,
      statusLabel: attitudeLabel(reaction.attitude),
      reaction: reaction.reactionText,
      reasoning: reaction.reason,
      satisfactionDelta: reaction.satisfactionDelta,
      metricImpact: {},
    })),
    aiAssessment: {
      summary: adjudication.aiAssessment.summary,
      feasibility: adjudication.aiAssessment.feasibility,
      escalationRisk: adjudication.aiAssessment.escalationRisk,
      confidence: adjudication.aiAssessment.confidence,
      metricImpact,
    },
    eventResolutionForecast: adjudication.eventResolutionForecast.map((forecast) => ({
      eventId: forecast.eventId,
      resolutionStatus: forecast.resolutionStatus,
      reasoning: forecast.reason,
      metricImpact: forecast.expectedImpact,
    })),
    nextRoundRisks: adjudication.nextRoundRisks,
  });
}

function normalizeAdjudication(value: unknown): unknown {
  const frontendParse = AIAdjudicationSchema.safeParse(value);

  if (frontendParse.success) {
    return frontendParse.data;
  }

  const backendParse = BackendEvaluateProposalOutputSchema.safeParse(value);

  if (backendParse.success) {
    return normalizeBackendAdjudication(backendParse.data);
  }

  return value;
}

export async function createGame(): Promise<GameSnapshot> {
  const data = await callEdgeFunction('create-game');
  return parseResponseData('create-game', GameSnapshotSchema, normalizeGameSnapshot(data));
}

export async function getGameState(gameId: string): Promise<GameSnapshot> {
  const validatedGameId = validateInput(UuidSchema, gameId, 'gameId 必须是合法 UUID。');
  const data = await callEdgeFunction('get-game-state', {
    body: { gameId: validatedGameId },
  });

  return parseResponseData('get-game-state', GameSnapshotSchema, normalizeGameSnapshot(data));
}

export async function generateEvents(gameId: string, roundNumber: number, language: Language = 'zh'): Promise<GenerateEventsResponse> {
  const data = await callEdgeFunction('generate-events', {
    body: {
      gameId: validateInput(UuidSchema, gameId, 'gameId 必须是合法 UUID。'),
      roundNumber: validateInput(RoundNumberSchema, roundNumber, 'roundNumber 必须是 1 到 20 的整数。'),
      language: getAIPromptLanguage(language),
    },
  });

  return parseResponseData('generate-events', GenerateEventsResponseSchema, data);
}

export async function advanceStage(gameId: string): Promise<AdvanceStageResponse> {
  const data = await callEdgeFunction('advance-stage', {
    body: {
      gameId: validateInput(UuidSchema, gameId, 'gameId 必须是合法 UUID。'),
    },
  });

  return parseResponseData('advance-stage', AdvanceStageResponseSchema, data);
}

export async function submitProposal(
  gameId: string,
  roundNumber: number,
  proposalText: string,
  language: Language = 'zh',
): Promise<SubmitProposalResponse> {
  const data = await callEdgeFunction('submit-proposal', {
    body: {
      gameId: validateInput(UuidSchema, gameId, 'gameId 必须是合法 UUID。'),
      roundNumber: validateInput(RoundNumberSchema, roundNumber, 'roundNumber 必须是 1 到 20 的整数。'),
      proposalText: validateInput(ProposalTextSchema, proposalText, 'proposalText 必须是 8 到 2000 个字符。'),
      language: getAIPromptLanguage(language),
    },
  });
  const raw = parseResponseData('submit-proposal', RawSubmitProposalResponseSchema, data);
  const normalized = {
    proposal: raw.proposal,
    adjudication: normalizeBackendAdjudication(raw.adjudication),
    currentStage: raw.currentStage,
    aiSource: raw.aiSource,
  };

  return parseResponseData('submit-proposal', SubmitProposalResponseSchema, normalized);
}

export async function settleRound(gameId: string, roundNumber: number): Promise<SettleRoundResponse> {
  const data = await callEdgeFunction('settle-round', {
    body: {
      gameId: validateInput(UuidSchema, gameId, 'gameId 必须是合法 UUID。'),
      roundNumber: validateInput(RoundNumberSchema, roundNumber, 'roundNumber 必须是 1 到 20 的整数。'),
    },
  });

  return parseResponseData('settle-round', SettleRoundResponseSchema, data);
}

export async function nextRound(gameId: string): Promise<GameSnapshot> {
  const data = await callEdgeFunction('next-round', {
    body: {
      gameId: validateInput(UuidSchema, gameId, 'gameId 必须是合法 UUID。'),
    },
  });

  return parseResponseData('next-round', GameSnapshotSchema, normalizeGameSnapshot(data));
}

export async function getAllianceMap(): Promise<AllianceMapResponse> {
  const data = await callEdgeFunction('alliance-map', {
    method: 'GET',
    requireAuth: false,
  });

  return parseResponseData('alliance-map', AllianceMapResponseSchema, data);
}
