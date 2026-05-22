import type { z } from 'zod';
import {
  AIAdjudicationSchema,
  AIAssessmentSchema,
  AllianceReactionAttitudeSchema,
  AllianceReactionSchema,
  AllianceSchema,
  AllianceSettlementChangeSchema,
  AllianceStateSchema,
  DiplomaticProposalSchema,
  EventResolutionForecastSchema,
  EventResolutionStatusSchema,
  EventSettlementResultSchema,
  EventSeveritySchema,
  EventTypeSchema,
  GameRecordSchema,
  GameSnapshotSchema,
  GameStatusSchema,
  MetricChangesSchema,
  MetricDeltaSchema,
  NextRoundRiskSchema,
  ProposalUnderstandingSchema,
  RoundEventSchema,
  RoundSettlementSchema,
  RoundStageSchema,
  TimestampSchema,
  WorldMetricSchema,
  WorldStateSchema,
} from '../lib/gameSchemas';

export {
  AIAdjudicationSchema,
  AIAssessmentSchema,
  AllianceReactionAttitudeSchema,
  AllianceReactionSchema,
  AllianceSchema,
  AllianceSettlementChangeSchema,
  AllianceStateSchema,
  DiplomaticProposalSchema,
  EventResolutionForecastSchema,
  EventResolutionStatusSchema,
  EventSettlementResultSchema,
  EventSeveritySchema,
  EventTypeSchema,
  GameRecordSchema,
  GameSnapshotSchema,
  GameStatusSchema,
  MetricChangesSchema,
  MetricDeltaSchema,
  NextRoundRiskSchema,
  ProposalUnderstandingSchema,
  RoundEventSchema,
  RoundSettlementSchema,
  RoundStageSchema,
  TimestampSchema,
  WorldMetricSchema,
  WorldStateSchema,
} from '../lib/gameSchemas';

export type RoundStage = z.infer<typeof RoundStageSchema>;
export type GameStatus = z.infer<typeof GameStatusSchema>;
export type EventSeverity = z.infer<typeof EventSeveritySchema>;
export type EventType = z.infer<typeof EventTypeSchema>;
export type AllianceReactionAttitude = z.infer<typeof AllianceReactionAttitudeSchema>;
export type EventResolutionStatus = z.infer<typeof EventResolutionStatusSchema>;

export type WorldMetric = z.infer<typeof WorldMetricSchema>;
export type MetricDelta = z.infer<typeof MetricDeltaSchema>;
export type MetricChanges = z.infer<typeof MetricChangesSchema>;
export type Timestamp = z.infer<typeof TimestampSchema>;

export type WorldState = z.infer<typeof WorldStateSchema>;
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
