/**
 * 单一来源的契约模块：前端（src/）和 Edge Functions（supabase/functions/）共享。
 *
 * 前端 import 方式：`import { ... } from '@contracts'`（tsconfig + vite alias）。
 * 后端 import 方式：`import { ... } from '../../../packages/contracts/index.ts'`
 *   （Deno 用相对路径 + 显式 .ts 后缀；Zod 通过 supabase/functions/deno.json 的 imports 映射到 npm:zod@4.4.3）。
 *
 * 命名约定：
 *   - 所有 Zod schema 以 Schema 结尾。
 *   - 类型别名用 z.infer<typeof XxxSchema>。
 *   - 跟"AI 原始输出"相关的 schema 用 RawAi* 前缀，与"已归一化为前端 UI 形态"的 schema 区分开。
 */
import { z } from 'zod';

// ============================================================
// 枚举常量（用 as const 数组保留字面量类型供两端复用）
// ============================================================
export const ROUND_STAGE_VALUES = [
  'RANDOM_EVENT',
  'SITUATION_OVERVIEW',
  'DIPLOMATIC_PROPOSAL',
  'AI_ADJUDICATION',
  'ROUND_SETTLEMENT',
] as const;

export const GAME_STATUS_VALUES = ['ACTIVE', 'WON', 'FAILED', 'COLD_PEACE', 'ABANDONED'] as const;

export const EVENT_SEVERITY_VALUES = ['HIGH', 'MEDIUM', 'LOW', 'OPPORTUNITY'] as const;

export const EVENT_TYPE_VALUES = [
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

export const ALLIANCE_REACTION_ATTITUDE_VALUES = [
  'ACCEPT',
  'ACCEPT_CONDITIONALLY',
  'NEUTRAL',
  'CONCERNED',
  'REJECT',
] as const;

export const EVENT_RESOLUTION_STATUS_VALUES = [
  'RESOLVED',
  'PARTIALLY_RESOLVED',
  'UNCHANGED',
  'WORSENED',
] as const;

export const AI_SOURCE_VALUES = ['mock', 'live', 'fallback'] as const;

// ============================================================
// 枚举 schema
// ============================================================
export const RoundStageSchema = z.enum(ROUND_STAGE_VALUES);
export const GameStatusSchema = z.enum(GAME_STATUS_VALUES);
export const EventSeveritySchema = z.enum(EVENT_SEVERITY_VALUES);
export const EventTypeSchema = z.enum(EVENT_TYPE_VALUES);
export const AllianceReactionAttitudeSchema = z.enum(ALLIANCE_REACTION_ATTITUDE_VALUES);
export const EventResolutionStatusSchema = z.enum(EVENT_RESOLUTION_STATUS_VALUES);
export const AiSourceSchema = z.enum(AI_SOURCE_VALUES);

// ============================================================
// 通用基础 schema
// ============================================================
/** 0..100 整数。前后端统一 int（DB 列是 int，前端实际数据也都是 int）。 */
export const WorldMetricSchema = z.number().int().min(0).max(100);
export const MetricDeltaSchema = z.number().int().min(-100).max(100);
export const TimestampSchema = z.string().datetime({ offset: true });
export const NonEmptyTextSchema = z.string().trim().min(1);
export const IdSchema = z.string().trim().min(1);

export const WorldStateSchema = z
  .object({
    globalTension: WorldMetricSchema,
    worldStability: WorldMetricSchema,
    aiRisk: WorldMetricSchema,
    economicPressure: WorldMetricSchema,
    humanitarianCrisis: WorldMetricSchema,
    peaceAgreement: WorldMetricSchema,
  })
  .strict();

/** 宽松版 metric changes：前端契约 / 数据库存储用，单字段 ±100。 */
export const MetricChangesSchema = z
  .object({
    globalTension: MetricDeltaSchema.optional(),
    worldStability: MetricDeltaSchema.optional(),
    aiRisk: MetricDeltaSchema.optional(),
    economicPressure: MetricDeltaSchema.optional(),
    humanitarianCrisis: MetricDeltaSchema.optional(),
    peaceAgreement: MetricDeltaSchema.optional(),
  })
  .strict();

/**
 * 严格版 metric changes：AI 输出 / 规则引擎单回合上限。
 * 单字段范围比 MetricChangesSchema 紧（globalTension ±15，peaceAgreement ±8 等），
 * 让 AI 不能在一回合里推动剧烈变化。
 */
export const AiMetricChangesSchema = z
  .object({
    globalTension: z.number().int().min(-15).max(15).optional(),
    worldStability: z.number().int().min(-12).max(12).optional(),
    aiRisk: z.number().int().min(-10).max(10).optional(),
    economicPressure: z.number().int().min(-10).max(10).optional(),
    humanitarianCrisis: z.number().int().min(-10).max(10).optional(),
    peaceAgreement: z.number().int().min(-8).max(8).optional(),
  })
  .strict();

// ============================================================
// 联盟 / 事件 / 提案 / 游戏 record schema
// ============================================================
export const AllianceSchema = z
  .object({
    id: IdSchema,
    name: NonEmptyTextSchema,
    shortName: NonEmptyTextSchema,
    iconKey: NonEmptyTextSchema,
    color: NonEmptyTextSchema,
    personality: NonEmptyTextSchema,
    coreDemand: NonEmptyTextSchema,
    redLines: z.array(NonEmptyTextSchema),
  })
  .strict();

export const AllianceStateSchema = z
  .object({
    allianceId: IdSchema,
    allianceName: NonEmptyTextSchema,
    stance: NonEmptyTextSchema,
    satisfaction: WorldMetricSchema,
    currentDemand: NonEmptyTextSchema,
    pressureTags: z.array(NonEmptyTextSchema),
    lastReaction: NonEmptyTextSchema.nullable(),
  })
  .strict();

export const RoundEventSchema = z
  .object({
    id: IdSchema,
    title: NonEmptyTextSchema,
    type: EventTypeSchema,
    severity: EventSeveritySchema,
    description: NonEmptyTextSchema,
    involvedAlliances: z.array(IdSchema),
    potentialImpact: MetricChangesSchema,
    recommendedActions: z.array(NonEmptyTextSchema),
    unresolvedConsequence: NonEmptyTextSchema,
    resolutionStatus: EventResolutionStatusSchema,
  })
  .strict();

export const DiplomaticProposalSchema = z
  .object({
    id: IdSchema,
    proposalText: z.string().trim().min(8).max(2000),
    mentionedAlliances: z.array(IdSchema),
    actionTypes: z.array(NonEmptyTextSchema),
    submittedAt: TimestampSchema,
  })
  .strict();

// ============================================================
// 已归一化的 AI 裁定 schema（前端契约形态）
// ============================================================
export const ProposalUnderstandingSchema = z
  .object({
    summary: NonEmptyTextSchema,
    primaryGoal: NonEmptyTextSchema,
    keyActions: z.array(NonEmptyTextSchema),
    targetedAlliances: z.array(IdSchema),
    risks: z.array(NonEmptyTextSchema),
  })
  .strict();

export const AllianceReactionSchema = z
  .object({
    allianceId: IdSchema,
    attitude: AllianceReactionAttitudeSchema,
    statusLabel: NonEmptyTextSchema,
    reaction: NonEmptyTextSchema,
    reasoning: NonEmptyTextSchema,
    satisfactionDelta: z.number().int().min(-30).max(30),
    metricImpact: MetricChangesSchema,
  })
  .strict();

export const AIAssessmentSchema = z
  .object({
    summary: NonEmptyTextSchema,
    feasibility: z.number().min(0).max(1),
    escalationRisk: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    metricImpact: MetricChangesSchema,
  })
  .strict();

export const EventResolutionForecastSchema = z
  .object({
    eventId: IdSchema,
    resolutionStatus: EventResolutionStatusSchema,
    reasoning: NonEmptyTextSchema,
    metricImpact: MetricChangesSchema,
  })
  .strict();

/** 下一回合风险预警（AI 输出与前端 UI 形态相同，前后端共用一份）。 */
export const NextRoundRiskSchema = z
  .object({
    title: NonEmptyTextSchema,
    severity: EventSeveritySchema,
    type: EventTypeSchema,
    description: NonEmptyTextSchema,
    involvedAlliances: z.array(IdSchema),
  })
  .strict();

export const AIAdjudicationSchema = z
  .object({
    proposalUnderstanding: ProposalUnderstandingSchema,
    allianceReactions: z.array(AllianceReactionSchema).min(1),
    aiAssessment: AIAssessmentSchema,
    eventResolutionForecast: z.array(EventResolutionForecastSchema),
    nextRoundRisks: z.array(NextRoundRiskSchema),
  })
  .strict();

// ============================================================
// 结算 / 游戏快照 schema
// ============================================================
export const EventSettlementResultSchema = z
  .object({
    eventId: IdSchema,
    title: NonEmptyTextSchema,
    resolutionStatus: EventResolutionStatusSchema,
    summary: NonEmptyTextSchema,
    metricChanges: MetricChangesSchema,
  })
  .strict();

export const AllianceSettlementChangeSchema = z
  .object({
    allianceId: IdSchema,
    allianceName: NonEmptyTextSchema,
    satisfactionDelta: z.number().int().min(-100).max(100),
    newSatisfaction: WorldMetricSchema,
    stance: NonEmptyTextSchema,
    currentDemand: NonEmptyTextSchema,
    pressureTags: z.array(NonEmptyTextSchema),
  })
  .strict();

export const RoundSettlementSchema = z
  .object({
    round: z.number().int().min(1).max(20),
    summary: NonEmptyTextSchema,
    metricChanges: MetricChangesSchema,
    newWorldState: WorldStateSchema,
    eventResults: z.array(EventSettlementResultSchema),
    allianceChanges: z.array(AllianceSettlementChangeSchema),
    nextRoundWarnings: z.array(NonEmptyTextSchema),
    rating: z.number().int().min(0).max(100),
    ratingText: NonEmptyTextSchema,
    gameStatus: GameStatusSchema,
  })
  .strict();

export const GameRecordSchema = z
  .object({
    id: IdSchema,
    status: GameStatusSchema,
    stage: RoundStageSchema,
    currentRound: z.number().int().min(1).max(20),
    maxRounds: z.number().int().min(1).max(20),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    endedAt: TimestampSchema.nullable(),
  })
  .strict();

export const GameSnapshotSchema = z
  .object({
    game: GameRecordSchema,
    worldState: WorldStateSchema,
    alliances: z.array(AllianceStateSchema),
    currentRound: z.number().int().min(1).max(20),
    events: z.array(RoundEventSchema),
    proposal: DiplomaticProposalSchema.nullable(),
    adjudication: AIAdjudicationSchema.nullable(),
    settlement: RoundSettlementSchema.nullable(),
  })
  .strict();

// ============================================================
// AI 原始输出 schema（仅后端 _shared/aiSchemas 引用，前端 normalize 后转为
// AIAdjudication / GenerateEventsResponse）
// ============================================================
const RawAiGeneratedEventSchema = z
  .object({
    title: NonEmptyTextSchema,
    type: EventTypeSchema,
    severity: EventSeveritySchema,
    description: NonEmptyTextSchema,
    involvedAlliances: z.array(NonEmptyTextSchema),
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

// ============================================================
// 类型别名（z.infer<typeof XxxSchema>）
// ============================================================
export type RoundStage = z.infer<typeof RoundStageSchema>;
export type GameStatus = z.infer<typeof GameStatusSchema>;
export type EventSeverity = z.infer<typeof EventSeveritySchema>;
export type EventType = z.infer<typeof EventTypeSchema>;
export type AllianceReactionAttitude = z.infer<typeof AllianceReactionAttitudeSchema>;
export type EventResolutionStatus = z.infer<typeof EventResolutionStatusSchema>;
export type AiSource = z.infer<typeof AiSourceSchema>;

export type WorldMetric = z.infer<typeof WorldMetricSchema>;
export type MetricDelta = z.infer<typeof MetricDeltaSchema>;
export type Timestamp = z.infer<typeof TimestampSchema>;
export type WorldState = z.infer<typeof WorldStateSchema>;
export type MetricChanges = z.infer<typeof MetricChangesSchema>;
export type AiMetricChanges = z.infer<typeof AiMetricChangesSchema>;

export type Alliance = z.infer<typeof AllianceSchema>;
export type AllianceState = z.infer<typeof AllianceStateSchema>;
export type RoundEvent = z.infer<typeof RoundEventSchema>;
export type DiplomaticProposal = z.infer<typeof DiplomaticProposalSchema>;

export type ProposalUnderstanding = z.infer<typeof ProposalUnderstandingSchema>;
export type AllianceReaction = z.infer<typeof AllianceReactionSchema>;
export type AIAssessment = z.infer<typeof AIAssessmentSchema>;
export type EventResolutionForecast = z.infer<typeof EventResolutionForecastSchema>;
export type NextRoundRisk = z.infer<typeof NextRoundRiskSchema>;
export type AIAdjudication = z.infer<typeof AIAdjudicationSchema>;

export type EventSettlementResult = z.infer<typeof EventSettlementResultSchema>;
export type AllianceSettlementChange = z.infer<typeof AllianceSettlementChangeSchema>;
export type RoundSettlement = z.infer<typeof RoundSettlementSchema>;
export type GameRecord = z.infer<typeof GameRecordSchema>;
export type GameSnapshot = z.infer<typeof GameSnapshotSchema>;

export type GenerateEventsOutput = z.infer<typeof GenerateEventsOutputSchema>;
export type EvaluateProposalOutput = z.infer<typeof EvaluateProposalOutputSchema>;
