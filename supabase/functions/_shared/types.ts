export type RoundStage =
  | 'RANDOM_EVENT'
  | 'SITUATION_OVERVIEW'
  | 'DIPLOMATIC_PROPOSAL'
  | 'AI_ADJUDICATION'
  | 'ROUND_SETTLEMENT';

export type GameStatus = 'ACTIVE' | 'WON' | 'FAILED' | 'COLD_PEACE' | 'ABANDONED';

export type EventSeverity = 'HIGH' | 'MEDIUM' | 'LOW' | 'OPPORTUNITY';

export type EventType =
  | 'MILITARY'
  | 'ENERGY'
  | 'CYBER'
  | 'AI'
  | 'FOOD'
  | 'REFUGEE'
  | 'ECONOMY'
  | 'DIPLOMACY'
  | 'SUPPLY_CHAIN';

export type AllianceReactionAttitude =
  | 'ACCEPT'
  | 'ACCEPT_CONDITIONALLY'
  | 'NEUTRAL'
  | 'CONCERNED'
  | 'REJECT';

export type EventResolutionStatus = 'RESOLVED' | 'PARTIALLY_RESOLVED' | 'UNCHANGED' | 'WORSENED';

export type WorldMetricKey =
  | 'globalTension'
  | 'worldStability'
  | 'aiRisk'
  | 'economicPressure'
  | 'humanitarianCrisis'
  | 'peaceAgreement';

export type WorldState = Record<WorldMetricKey, number>;

export type MetricChanges = Partial<Record<WorldMetricKey, number>>;

export type Alliance = {
  id: string;
  name: string;
  shortName: string;
  iconKey: string;
  color: string;
  personality: string;
  coreDemand: string;
  redLines: string[];
};

export type AllianceState = {
  allianceId: string;
  allianceName: string;
  stance: string;
  satisfaction: number;
  currentDemand: string;
  pressureTags: string[];
  lastReaction: string | null;
};

export type RoundEvent = {
  id: string;
  title: string;
  type: EventType;
  severity: EventSeverity;
  description: string;
  involvedAlliances: string[];
  involvedCountries: string[];
  potentialImpact: MetricChanges;
  recommendedActions: string[];
  unresolvedConsequence: string;
  resolutionStatus: EventResolutionStatus;
};

export type DiplomaticProposal = {
  id: string;
  proposalText: string;
  mentionedAlliances: string[];
  actionTypes: string[];
  submittedAt: string;
};

export type AllianceReaction = {
  allianceId: string;
  attitude: AllianceReactionAttitude;
  statusLabel: string;
  reaction: string;
  reasoning: string;
  satisfactionDelta: number;
  metricImpact: MetricChanges;
};

export type AIAdjudication = {
  proposalUnderstanding: {
    summary: string;
    primaryGoal: string;
    keyActions: string[];
    targetedAlliances: string[];
    risks: string[];
  };
  allianceReactions: AllianceReaction[];
  aiAssessment: {
    summary: string;
    feasibility: number;
    escalationRisk: number;
    confidence: number;
    metricImpact: MetricChanges;
  };
  eventResolutionForecast: Array<{
    eventId: string;
    resolutionStatus: EventResolutionStatus;
    reasoning: string;
    metricImpact: MetricChanges;
  }>;
  nextRoundRisks: Array<{
    title: string;
    severity: EventSeverity;
    type: EventType;
    description: string;
    involvedAlliances: string[];
  }>;
};

export type RoundSettlement = {
  round: number;
  summary: string;
  metricChanges: MetricChanges;
  newWorldState: WorldState;
  eventResults: Array<{
    eventId: string;
    title: string;
    resolutionStatus: EventResolutionStatus;
    summary: string;
    metricChanges: MetricChanges;
  }>;
  allianceChanges: Array<{
    allianceId: string;
    allianceName: string;
    satisfactionDelta: number;
    newSatisfaction: number;
    stance: string;
    currentDemand: string;
    pressureTags: string[];
  }>;
  nextRoundWarnings: string[];
  rating: number;
  ratingText: string;
  gameStatus: GameStatus;
};

export type GameSnapshot = {
  game: {
    id: string;
    status: GameStatus;
    stage: RoundStage;
    currentRound: number;
    maxRounds: number;
    createdAt: string;
    updatedAt: string;
    endedAt: string | null;
  };
  worldState: WorldState;
  alliances: AllianceState[];
  currentRound: number;
  events: RoundEvent[];
  proposal: DiplomaticProposal | null;
  adjudication: AIAdjudication | null;
  settlement: RoundSettlement | null;
};
