import { z } from 'npm:zod@4.4.3';

const EventTypeSchema = z.enum([
  'MILITARY',
  'ENERGY',
  'CYBER',
  'AI',
  'FOOD',
  'REFUGEE',
  'ECONOMY',
  'DIPLOMACY',
  'SUPPLY_CHAIN',
]);

const EventSeveritySchema = z.enum(['HIGH', 'MEDIUM', 'LOW', 'OPPORTUNITY']);

const AllianceReactionAttitudeSchema = z.enum([
  'ACCEPT',
  'ACCEPT_CONDITIONALLY',
  'NEUTRAL',
  'CONCERNED',
  'REJECT',
]);

const EventResolutionStatusSchema = z.enum([
  'RESOLVED',
  'PARTIALLY_RESOLVED',
  'UNCHANGED',
  'WORSENED',
]);

const GameStatusSchema = z.enum(['ACTIVE', 'WON', 'FAILED', 'COLD_PEACE', 'ABANDONED']);

const NonEmptyTextSchema = z.string().trim().min(1);
const WorldMetricSchema = z.number().int().min(0).max(100);

const MetricChangesSchema = z
  .object({
    globalTension: z.number().int().min(-15).max(15).optional(),
    worldStability: z.number().int().min(-12).max(12).optional(),
    aiRisk: z.number().int().min(-10).max(10).optional(),
    economicPressure: z.number().int().min(-10).max(10).optional(),
    humanitarianCrisis: z.number().int().min(-10).max(10).optional(),
    peaceAgreement: z.number().int().min(-8).max(8).optional(),
  })
  .strict();

const WorldStateSchema = z
  .object({
    globalTension: WorldMetricSchema,
    worldStability: WorldMetricSchema,
    aiRisk: WorldMetricSchema,
    economicPressure: WorldMetricSchema,
    humanitarianCrisis: WorldMetricSchema,
    peaceAgreement: WorldMetricSchema,
  })
  .strict();

const GeneratedEventSchema = z
  .object({
    title: NonEmptyTextSchema,
    type: EventTypeSchema,
    severity: EventSeveritySchema,
    description: NonEmptyTextSchema,
    involvedAlliances: z.array(NonEmptyTextSchema),
    potentialImpact: MetricChangesSchema,
    recommendedActions: z.array(NonEmptyTextSchema).min(1),
    unresolvedConsequence: NonEmptyTextSchema,
  })
  .strict();

export const GenerateEventsOutputSchema = z
  .object({
    events: z.array(GeneratedEventSchema).min(3).max(5),
    roundBriefing: NonEmptyTextSchema,
    priorityIssue: NonEmptyTextSchema,
  })
  .strict();

const ProposalUnderstandingSchema = z
  .object({
    mainGoal: NonEmptyTextSchema,
    mentionedAlliances: z.array(NonEmptyTextSchema),
    actionTypes: z.array(NonEmptyTextSchema),
    targetEvents: z.array(NonEmptyTextSchema),
  })
  .strict();

const ProposalAllianceReactionSchema = z
  .object({
    alliance: NonEmptyTextSchema,
    attitude: AllianceReactionAttitudeSchema,
    reactionText: NonEmptyTextSchema,
    reason: NonEmptyTextSchema,
    satisfactionDelta: z.number().int().min(-20).max(20),
  })
  .strict();

const ProposalAssessmentSchema = z
  .object({
    successProbability: WorldMetricSchema,
    summary: NonEmptyTextSchema,
    strengths: z.array(NonEmptyTextSchema),
    weaknesses: z.array(NonEmptyTextSchema),
    expectedImpact: MetricChangesSchema,
  })
  .strict();

const EventResolutionForecastSchema = z
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
    involvedAlliances: z.array(NonEmptyTextSchema),
  })
  .strict();

export const EvaluateProposalOutputSchema = z
  .object({
    proposalUnderstanding: ProposalUnderstandingSchema,
    allianceReactions: z.array(ProposalAllianceReactionSchema).min(1),
    aiAssessment: ProposalAssessmentSchema,
    eventResolutionForecast: z.array(EventResolutionForecastSchema),
    nextRoundRisks: z.array(NextRoundRiskSchema),
  })
  .strict();

const EventResultSchema = z
  .object({
    eventTitle: NonEmptyTextSchema,
    resolutionStatus: EventResolutionStatusSchema,
    resultText: NonEmptyTextSchema,
    metricChanges: MetricChangesSchema,
  })
  .strict();

const AllianceChangeSchema = z
  .object({
    alliance: NonEmptyTextSchema,
    satisfactionDelta: z.number().int().min(-20).max(20),
    newSatisfaction: WorldMetricSchema,
    newStance: NonEmptyTextSchema,
    currentDemand: NonEmptyTextSchema,
    pressureTags: z.array(NonEmptyTextSchema),
    lastReaction: NonEmptyTextSchema,
  })
  .strict();

export const RoundSettlementOutputSchema = z
  .object({
    round: z.number().int().min(1).max(20),
    settlementTitle: NonEmptyTextSchema,
    summary: NonEmptyTextSchema,
    metricChanges: MetricChangesSchema,
    newWorldState: WorldStateSchema,
    eventResults: z.array(EventResultSchema),
    allianceChanges: z.array(AllianceChangeSchema),
    nextRoundWarnings: z.array(NonEmptyTextSchema),
    rating: z.number().int().min(0).max(100),
    ratingText: NonEmptyTextSchema,
    gameStatus: GameStatusSchema,
  })
  .strict();
