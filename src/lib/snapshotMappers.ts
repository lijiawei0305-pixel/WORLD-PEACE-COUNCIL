/**
 * 把后端 snapshot 字段（`WorldState / AllianceState / RoundEvent`）转换为前端 HUD 组件需要的展示对象。
 * 这些函数都是纯的，不依赖 React 状态，可以单独单元测试。
 */
import type {
  AllianceState,
  EventSeverity,
  EventType,
  RoundEvent,
  RoundStage,
  WorldState,
} from '../contracts/game';
import {
  allianceProfiles,
  councilAlliances,
  worldMetrics as demoWorldMetrics,
  type AllianceProfile,
  type TurnEvent,
  type WorldMetric,
} from '../data/worldPeaceCouncil';

/** 后端 RoundStage 枚举 → HUD StageStepper 高亮索引（0..4）。 */
export const stageIndexByRoundStage: Record<RoundStage, number> = {
  RANDOM_EVENT: 0,
  SITUATION_OVERVIEW: 1,
  DIPLOMATIC_PROPOSAL: 2,
  AI_ADJUDICATION: 3,
  ROUND_SETTLEMENT: 4,
};

const backendAllianceIdToDisplayId: Record<string, AllianceProfile['id']> = {
  north_west: 'north_american_western_alliance',
  china: 'zhonghua_alliance',
  russia: 'russian_alliance',
  middle_east: 'middle_east_islamic_alliance',
  africa: 'african_union',
  latin_america: 'latin_american_south_american_alliance',
  southeast_asia: 'southeast_asia_alliance',
};

const eventTypeLabel: Record<EventType, string> = {
  MILITARY: '军事',
  ENERGY: '能源',
  CYBER: '网络',
  AI: 'AI',
  FOOD: '粮食',
  REFUGEE: '难民',
  ECONOMY: '经济',
  DIPLOMACY: '外交',
  SUPPLY_CHAIN: '供应链',
};

const eventSeverityRisk: Record<EventSeverity, TurnEvent['risk']> = {
  HIGH: '高危',
  MEDIUM: '中危',
  LOW: '中危',
  OPPORTUNITY: '机会',
};

const stanceLabels: ReadonlySet<string> = new Set([
  '友好',
  '支持',
  '合作',
  '中立',
  '观望',
  '警惕',
  '强硬',
  '敌对',
]);

function getMetricValue(
  worldState: WorldState | undefined,
  key: keyof WorldState,
  fallbackId: string,
): number {
  return worldState?.[key] ?? demoWorldMetrics.find((metric) => metric.id === fallbackId)?.value ?? 0;
}

/**
 * 把后端 `WorldState`（六个 0..100 数字字段）映射为 HUD 顶栏 / 左栏使用的 `WorldMetric[]`。
 * 缺失的字段会回退到 `data/worldPeaceCouncil` 的 demo 数据，避免 UI 出现 0 占位。
 *
 * @param worldState 后端世界状态；可缺省（首次连接时）
 * @returns 6 条 metric（紧张度 / 稳定度 / AI 风险 / 经济 / 人道 / 和平协议）
 */
export function mapWorldStateToMetrics(worldState?: WorldState): WorldMetric[] {
  return [
    { id: 'tension', label: '全球紧张度', icon: '!', value: getMetricValue(worldState, 'globalTension', 'tension'), max: 100, tone: 'red' },
    { id: 'stability', label: '世界稳定度', icon: '+', value: getMetricValue(worldState, 'worldStability', 'stability'), max: 100, tone: 'green' },
    { id: 'aiRisk', label: 'AI 风险指数', icon: 'AI', value: getMetricValue(worldState, 'aiRisk', 'aiRisk'), max: 100, tone: 'yellow' },
    { id: 'economy', label: '经济压力', icon: '$', value: getMetricValue(worldState, 'economicPressure', 'economy'), max: 100, tone: 'blue' },
    { id: 'humanitarian', label: '人道危机', icon: 'H', value: getMetricValue(worldState, 'humanitarianCrisis', 'humanitarian'), max: 100, tone: 'orange' },
    { id: 'peaceAgreement', label: '和平协议', icon: 'P', value: worldState?.peaceAgreement ?? 20, max: 100, tone: 'blue' },
  ];
}

/**
 * 把后端 stance 字符串规整为 UI 已知的 8 种立场。后端如果返回了未识别的字符串，
 * 用满意度阈值兜底（≥75 支持 / ≥60 合作 / ≥45 中立 / ≥30 警惕 / 其余敌对）。
 *
 * @param stance 后端原始立场字符串
 * @param satisfaction 后端满意度（0..100）
 */
export function normalizeStance(stance: string, satisfaction: number): AllianceProfile['stance'] {
  if (stanceLabels.has(stance)) {
    return stance as AllianceProfile['stance'];
  }
  if (satisfaction >= 75) return '支持';
  if (satisfaction >= 60) return '合作';
  if (satisfaction >= 45) return '中立';
  if (satisfaction >= 30) return '警惕';
  return '敌对';
}

function stanceToneFromState(
  stance: AllianceProfile['stance'],
  satisfaction: number,
): AllianceProfile['stanceTone'] {
  if (stance === '敌对') return 'hostile';
  if (stance === '强硬') return 'hardline';
  if (stance === '警惕') return 'alert';
  if (stance === '观望') return 'watch';
  if (stance === '友好') return 'friendly';
  if (stance === '支持' || satisfaction >= 75) return 'support';
  return 'neutral';
}

function findBaseAlliance(state: AllianceState): AllianceProfile {
  const mappedId = backendAllianceIdToDisplayId[state.allianceId];
  const matched = councilAlliances.find((alliance) => (
    alliance.id === state.allianceId
    || alliance.id === mappedId
    || alliance.name === state.allianceName
    || alliance.shortName === state.allianceId
  ));

  return matched ?? allianceProfiles.north_american_western_alliance;
}

/**
 * 把后端 `AllianceState[]` 映射为 HUD 列表使用的 `AllianceProfile[]`：
 * 保留前端默认的图标 / 颜色 / 长 id，覆盖立场、stanceTone、满意度、当前诉求。
 * 当后端返回空数组时退化到前端 demo 七联盟（不会让 UI 整列空白）。
 *
 * @param states 后端联盟状态数组；可空
 * @returns 长度恒为 7 的 AllianceProfile 数组
 */
export function mapAllianceStatesToProfiles(states?: AllianceState[]): AllianceProfile[] {
  if (!states?.length) {
    return councilAlliances;
  }

  return states.map((state) => {
    const base = findBaseAlliance(state);
    const stance = normalizeStance(state.stance, state.satisfaction);

    return {
      ...base,
      name: state.allianceName || base.name,
      stance,
      stanceTone: stanceToneFromState(stance, state.satisfaction),
      satisfaction: state.satisfaction,
      demand: state.currentDemand || base.demand,
    };
  });
}

/**
 * 把后端 `RoundEvent[]` 映射为 HUD EventList 使用的精简形态：保留 id/title，
 * severity → risk（高危/中危/机会），type → topic（中文主题）。
 *
 * @param events 后端回合事件
 * @returns 精简 TurnEvent 数组；输入为空返回空数组
 */
export function mapRoundEventsToTurnEvents(events?: RoundEvent[]): TurnEvent[] {
  return events?.map((event) => ({
    id: event.id,
    title: event.title,
    risk: eventSeverityRisk[event.severity],
    topic: eventTypeLabel[event.type],
  })) ?? [];
}
