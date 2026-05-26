import { z } from 'zod';

/**
 * Edge Functions 专用 AI 输出 schema。
 *
 * 这里保持在 supabase/functions 目录内，避免 Supabase CLI 部署时跨目录读取
 * packages/contracts/index.ts 失败。前端契约仍由 packages/contracts 维护；如果
 * AI 输出结构发生变化，需要同步更新两侧 schema。
 */

const EVENT_SEVERITY_VALUES = ['HIGH', 'MEDIUM', 'LOW', 'OPPORTUNITY'] as const;
const EVENT_TYPE_VALUES = [
  'MILITARY',
  'ENERGY',
  'CYBER',
  'AI',
  'FOOD',
  'REFUGEE',
  'ECONOMY',
  'DIPLOMACY',
  'SUPPLY_CHAIN',
] as const;
const ALLIANCE_REACTION_ATTITUDE_VALUES = [
  'ACCEPT',
  'ACCEPT_CONDITIONALLY',
  'NEUTRAL',
  'CONCERNED',
  'REJECT',
] as const;
const EVENT_RESOLUTION_STATUS_VALUES = [
  'RESOLVED',
  'PARTIALLY_RESOLVED',
  'UNCHANGED',
  'WORSENED',
] as const;
const AI_SOURCE_VALUES = ['mock', 'live', 'fallback'] as const;

const NonEmptyTextSchema = z.string().trim().min(1);
const IdSchema = z.string().trim().min(1);
const WorldMetricSchema = z.number().int().min(0).max(100);
const EventSeveritySchema = z.enum(EVENT_SEVERITY_VALUES);
const EventTypeSchema = z.enum(EVENT_TYPE_VALUES);
const AllianceReactionAttitudeSchema = z.enum(ALLIANCE_REACTION_ATTITUDE_VALUES);
const EventResolutionStatusSchema = z.enum(EVENT_RESOLUTION_STATUS_VALUES);

export const AiSourceSchema = z.enum(AI_SOURCE_VALUES);
export type AiSource = z.infer<typeof AiSourceSchema>;

const AiMetricChangesSchema = z
  .object({
    globalTension: z.number().int().min(-15).max(15).optional(),
    worldStability: z.number().int().min(-12).max(12).optional(),
    aiRisk: z.number().int().min(-10).max(10).optional(),
    economicPressure: z.number().int().min(-10).max(10).optional(),
    humanitarianCrisis: z.number().int().min(-10).max(10).optional(),
    peaceAgreement: z.number().int().min(-10).max(12).optional(),
  })
  .strict();

const RawAiGeneratedEventSchema = z
  .object({
    title: NonEmptyTextSchema,
    type: EventTypeSchema,
    severity: EventSeveritySchema,
    description: NonEmptyTextSchema,
    involvedAlliances: z.array(NonEmptyTextSchema),
    // ISO 3166-1 alpha-3 国家代码列表，AI 可不输出（默认空数组），用于前端在地球上高亮该事件涉及的国家。
    involvedCountries: z.array(z.string().trim().regex(/^[A-Z]{3}$/u)).max(6).default([]),
    potentialImpact: AiMetricChangesSchema,
    recommendedActions: z.array(NonEmptyTextSchema).min(1),
    unresolvedConsequence: NonEmptyTextSchema,
  })
  .strict();

export const GenerateEventsOutputSchema = z
  .object({
    events: z.array(RawAiGeneratedEventSchema).min(3).max(5),
    roundBriefing: NonEmptyTextSchema,
    priorityIssue: NonEmptyTextSchema,
    aiSource: AiSourceSchema,
  })
  .strict();

const NextRoundRiskSchema = z
  .object({
    title: NonEmptyTextSchema,
    severity: EventSeveritySchema,
    type: EventTypeSchema,
    description: NonEmptyTextSchema,
    involvedAlliances: z.array(IdSchema),
  })
  .strict();

const RawAiProposalUnderstandingSchema = z
  .object({
    mainGoal: NonEmptyTextSchema,
    mentionedAlliances: z.array(NonEmptyTextSchema),
    actionTypes: z.array(NonEmptyTextSchema),
    targetEvents: z.array(NonEmptyTextSchema),
  })
  .strict();

const RawAiAllianceReactionSchema = z
  .object({
    alliance: NonEmptyTextSchema,
    attitude: AllianceReactionAttitudeSchema,
    reactionText: NonEmptyTextSchema,
    reason: NonEmptyTextSchema,
    satisfactionDelta: z.number().int().min(-20).max(20),
  })
  .strict();

const RawAiAssessmentSchema = z
  .object({
    successProbability: WorldMetricSchema,
    summary: NonEmptyTextSchema,
    strengths: z.array(NonEmptyTextSchema),
    weaknesses: z.array(NonEmptyTextSchema),
    expectedImpact: AiMetricChangesSchema,
    feasibility: z.number().min(0).max(1),
    escalationRisk: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
  })
  .strict();

const RawAiEventResolutionForecastSchema = z
  .object({
    eventId: z.string().uuid(),
    resolutionStatus: EventResolutionStatusSchema,
    reason: NonEmptyTextSchema,
    expectedImpact: AiMetricChangesSchema,
  })
  .strict();

export const EvaluateProposalOutputSchema = z
  .object({
    proposalUnderstanding: RawAiProposalUnderstandingSchema,
    allianceReactions: z.array(RawAiAllianceReactionSchema).min(1),
    aiAssessment: RawAiAssessmentSchema,
    eventResolutionForecast: z.array(RawAiEventResolutionForecastSchema),
    nextRoundRisks: z.array(NextRoundRiskSchema),
    aiSource: AiSourceSchema,
  })
  .strict();
