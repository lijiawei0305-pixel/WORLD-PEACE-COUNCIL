import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type {
  AIAdjudication,
  AllianceReactionAttitude,
  GameSnapshot,
  MetricChanges,
} from '../contracts/game';
import {
  AIAdjudicationSchema,
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
  RoundSettlementSchema,
  RoundStageSchema,
  WorldStateSchema,
} from './gameSchemas';

const FUNCTION_NAMES = [
  'create-game',
  'get-game-state',
  'generate-events',
  'advance-stage',
  'submit-proposal',
  'settle-round',
  'next-round',
  'alliance-map',
] as const;

type FunctionName = (typeof FUNCTION_NAMES)[number];
type RequestMethod = 'GET' | 'POST';

type EdgeFunctionOptions = {
  body?: unknown;
  method?: RequestMethod;
  requireAuth?: boolean;
};

type SupabaseConfig = {
  anonKey: string;
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
  })
  .strict();

const BackendEventResolutionForecastSchema = z
  .object({
    eventTitle: NonEmptyTextSchema,
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
  })
  .strict();

const SubmitProposalResponseSchema = z
  .object({
    proposal: DiplomaticProposalSchema,
    adjudication: AIAdjudicationSchema,
    currentStage: z.literal('AI_ADJUDICATION'),
  })
  .strict();

const SettleRoundResponseSchema = z
  .object({
    settlement: RoundSettlementSchema,
  })
  .strict();

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
  cachedConfig = {
    anonKey: supabaseAnonKey,
    functionsBaseUrl: `${normalizedUrl}/functions/v1`,
    url: normalizedUrl,
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

  return normalized;
}

function ratioFromPercentage(value: number): number {
  return Math.min(Math.max(value / 100, 0), 1);
}

function estimateEscalationRisk(metricImpact: MetricChanges): number {
  const tension = Math.max(metricImpact.globalTension ?? 0, 0);
  const aiRisk = Math.max(metricImpact.aiRisk ?? 0, 0);
  const humanitarian = Math.max(metricImpact.humanitarianCrisis ?? 0, 0);
  const stabilityLoss = Math.max(-(metricImpact.worldStability ?? 0), 0);

  return Math.min(0.35 + tension * 0.03 + aiRisk * 0.02 + humanitarian * 0.02 + stabilityLoss * 0.02, 1);
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
      feasibility: ratioFromPercentage(adjudication.aiAssessment.successProbability),
      escalationRisk: estimateEscalationRisk(metricImpact),
      confidence: 0.7,
      metricImpact,
    },
    eventResolutionForecast: adjudication.eventResolutionForecast.map((forecast) => ({
      eventId: forecast.eventTitle,
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

export async function generateEvents(gameId: string, roundNumber: number): Promise<GenerateEventsResponse> {
  const data = await callEdgeFunction('generate-events', {
    body: {
      gameId: validateInput(UuidSchema, gameId, 'gameId 必须是合法 UUID。'),
      roundNumber: validateInput(RoundNumberSchema, roundNumber, 'roundNumber 必须是 1 到 20 的整数。'),
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
): Promise<SubmitProposalResponse> {
  const data = await callEdgeFunction('submit-proposal', {
    body: {
      gameId: validateInput(UuidSchema, gameId, 'gameId 必须是合法 UUID。'),
      roundNumber: validateInput(RoundNumberSchema, roundNumber, 'roundNumber 必须是 1 到 20 的整数。'),
      proposalText: validateInput(ProposalTextSchema, proposalText, 'proposalText 必须是 8 到 2000 个字符。'),
    },
  });
  const raw = parseResponseData('submit-proposal', RawSubmitProposalResponseSchema, data);
  const normalized = {
    proposal: raw.proposal,
    adjudication: normalizeBackendAdjudication(raw.adjudication),
    currentStage: raw.currentStage,
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
