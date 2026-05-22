import { z } from 'zod';

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

export const RoundStageSchema = z.enum(ROUND_STAGE_VALUES);
export const GameStatusSchema = z.enum(GAME_STATUS_VALUES);
export const EventSeveritySchema = z.enum(EVENT_SEVERITY_VALUES);
export const EventTypeSchema = z.enum(EVENT_TYPE_VALUES);
export const AllianceReactionAttitudeSchema = z.enum(ALLIANCE_REACTION_ATTITUDE_VALUES);
export const EventResolutionStatusSchema = z.enum(EVENT_RESOLUTION_STATUS_VALUES);

export const WorldMetricSchema = z.number().min(0).max(100);
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
