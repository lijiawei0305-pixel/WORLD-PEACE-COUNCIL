import type { GameStatus, MetricChanges, WorldMetricKey, WorldState } from './types.ts';

const WORLD_METRIC_KEYS: WorldMetricKey[] = [
  'globalTension',
  'worldStability',
  'aiRisk',
  'economicPressure',
  'humanitarianCrisis',
  'peaceAgreement',
];

const METRIC_CHANGE_LIMITS: Record<WorldMetricKey, { min: number; max: number }> = {
  globalTension: { min: -15, max: 15 },
  worldStability: { min: -12, max: 12 },
  aiRisk: { min: -10, max: 10 },
  economicPressure: { min: -10, max: 10 },
  humanitarianCrisis: { min: -10, max: 10 },
  peaceAgreement: { min: -10, max: 12 },
};

export function clampValue(value: number, min = 0, max = 100): number {
  return Math.min(Math.max(value, min), max);
}

export function clampWorldState(worldState: WorldState): WorldState {
  return {
    globalTension: clampValue(worldState.globalTension),
    worldStability: clampValue(worldState.worldStability),
    aiRisk: clampValue(worldState.aiRisk),
    economicPressure: clampValue(worldState.economicPressure),
    humanitarianCrisis: clampValue(worldState.humanitarianCrisis),
    peaceAgreement: clampValue(worldState.peaceAgreement),
  };
}

export function clampMetricChanges(metricChanges: MetricChanges): MetricChanges {
  return WORLD_METRIC_KEYS.reduce<MetricChanges>((clampedChanges, key) => {
    const change = metricChanges[key];

    if (typeof change === 'number') {
      const limits = METRIC_CHANGE_LIMITS[key];
      clampedChanges[key] = clampValue(change, limits.min, limits.max);
    }

    return clampedChanges;
  }, {});
}

export function applyMetricChanges(worldState: WorldState, metricChanges: MetricChanges): WorldState {
  const clampedChanges = clampMetricChanges(metricChanges);

  return clampWorldState({
    globalTension: worldState.globalTension + (clampedChanges.globalTension ?? 0),
    worldStability: worldState.worldStability + (clampedChanges.worldStability ?? 0),
    aiRisk: worldState.aiRisk + (clampedChanges.aiRisk ?? 0),
    economicPressure: worldState.economicPressure + (clampedChanges.economicPressure ?? 0),
    humanitarianCrisis: worldState.humanitarianCrisis + (clampedChanges.humanitarianCrisis ?? 0),
    peaceAgreement: worldState.peaceAgreement + (clampedChanges.peaceAgreement ?? 0),
  });
}

export function getGameStatus(worldState: WorldState, currentRound: number): GameStatus {
  if (worldState.globalTension >= 100) {
    return 'FAILED';
  }

  if (currentRound >= 20 && worldState.peaceAgreement >= 60) {
    return 'WON';
  }

  if (currentRound >= 20 && worldState.globalTension < 100 && worldState.peaceAgreement < 60) {
    return 'COLD_PEACE';
  }

  return 'ACTIVE';
}

export function getStanceFromSatisfaction(satisfaction: number): string {
  const clampedSatisfaction = clampValue(satisfaction);

  if (clampedSatisfaction >= 75) {
    return '支持';
  }

  if (clampedSatisfaction >= 60) {
    return '合作';
  }

  if (clampedSatisfaction >= 45) {
    return '中立';
  }

  if (clampedSatisfaction >= 30) {
    return '警惕';
  }

  return '敌对';
}
