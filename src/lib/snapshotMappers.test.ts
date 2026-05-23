import { describe, expect, it } from 'vitest';
import type { WorldState } from '../contracts/game';
import { WorldMetricSchema } from './gameSchemas';
import { mapWorldStateToMetrics, normalizeStance } from './snapshotMappers';

describe('mapWorldStateToMetrics', () => {
  it('returns 6 metrics with stable ids in fixed order', () => {
    const worldState: WorldState = {
      globalTension: 60,
      worldStability: 65,
      aiRisk: 35,
      economicPressure: 40,
      humanitarianCrisis: 30,
      peaceAgreement: 20,
    };

    const metrics = mapWorldStateToMetrics(worldState);

    expect(metrics).toHaveLength(6);
    expect(metrics.map((metric) => metric.id)).toEqual([
      'tension',
      'stability',
      'aiRisk',
      'economy',
      'humanitarian',
      'peaceAgreement',
    ]);
    expect(metrics.find((metric) => metric.id === 'tension')?.value).toBe(60);
    expect(metrics.find((metric) => metric.id === 'peaceAgreement')?.value).toBe(20);
  });
});

describe('normalizeStance', () => {
  // 阈值映射：>=75 支持 / >=60 合作 / >=45 中立 / >=30 警惕 / 其余敌对
  // satisfaction=80 命中 >=75 分支，返回 '支持'。'友好' 仅在原 stance 字符串本身已是 '友好' 时直传。
  it('falls back to 支持 when satisfaction is 80 and stance is unknown', () => {
    expect(normalizeStance('', 80)).toBe('支持');
  });
});

describe('WorldMetricSchema', () => {
  it('rejects values out of 0..100 and accepts in-range values', () => {
    expect(WorldMetricSchema.safeParse(101).success).toBe(false);
    expect(WorldMetricSchema.safeParse(-1).success).toBe(false);
    expect(WorldMetricSchema.safeParse(50).success).toBe(true);
  });
});
