import { AFRICA_ISO_A3_SET, countryNames } from './demoCountryState';
import { getFactionConfig, neutralFaction, type FactionDisplayId, type FactionId } from './factions';

export type CouncilStageId = 'events' | 'overview' | 'proposal' | 'adjudication' | 'settlement';

export type CouncilStage = {
  id: CouncilStageId;
  label: string;
  statusLabel: string;
  helpText: string;
};

export const councilStages: CouncilStage[] = [
  {
    id: 'events',
    label: '随机事件',
    statusLabel: '随机事件生成',
    helpText: 'AI 已基于当前全球态势生成本回合随机事件。',
  },
  {
    id: 'overview',
    label: '局势总览',
    statusLabel: '局势研判',
    helpText: '审阅关键风险和联盟诉求后，进入外交提案阶段。',
  },
  {
    id: 'proposal',
    label: '外交提案',
    statusLabel: '外交提案',
    helpText: '提交一项多边外交提案，协调七大联盟降低战争风险。',
  },
  {
    id: 'adjudication',
    label: 'AI裁定',
    statusLabel: 'AI裁定',
    helpText: 'AI 正在模拟各联盟对提案的反应与综合影响。',
  },
  {
    id: 'settlement',
    label: '回合结算',
    statusLabel: '回合结算',
    helpText: '本回合事件结果已结算，准备进入下一回合。',
  },
];

export type AllianceId = FactionId;

export type AllianceProfile = {
  id: AllianceId;
  name: string;
  shortName: string;
  emblem: string;
  iconUrl: string;
  stance: string;
  stanceTone: 'friendly' | 'support' | 'neutral' | 'watch' | 'alert' | 'hardline' | 'hostile';
  satisfaction: number;
  demand: string;
  color: string;
  glow: string;
};

export const allianceOrder: AllianceId[] = [
  'north_american_western_alliance',
  'zhonghua_alliance',
  'russian_alliance',
  'middle_east_islamic_alliance',
  'african_union',
  'latin_american_south_american_alliance',
  'southeast_asia_alliance',
];

export const allianceProfiles: Record<AllianceId, AllianceProfile> = {
  north_american_western_alliance: {
    id: 'north_american_western_alliance',
    name: '北美·西方联盟',
    shortName: 'NAW',
    emblem: 'W',
    iconUrl: '/assets/icons/wpc/alliance-western.svg',
    stance: '警惕',
    stanceTone: 'alert',
    satisfaction: 61,
    demand: '建立军事透明机制',
    color: getFactionConfig('north_american_western_alliance').color,
    glow: getFactionConfig('north_american_western_alliance').glow,
  },
  zhonghua_alliance: {
    id: 'zhonghua_alliance',
    name: '中华联盟',
    shortName: 'ZHN',
    emblem: '中',
    iconUrl: '/assets/icons/wpc/alliance-zhonghua.svg',
    stance: '支持',
    stanceTone: 'support',
    satisfaction: 68,
    demand: '推动国际AI治理框架落地',
    color: getFactionConfig('zhonghua_alliance').color,
    glow: getFactionConfig('zhonghua_alliance').glow,
  },
  russian_alliance: {
    id: 'russian_alliance',
    name: '俄罗斯联邦',
    shortName: 'RUS',
    emblem: 'R',
    iconUrl: '/assets/icons/wpc/alliance-russian.svg',
    stance: '强硬',
    stanceTone: 'hardline',
    satisfaction: 46,
    demand: '保障边境安全与战略缓冲',
    color: getFactionConfig('russian_alliance').color,
    glow: getFactionConfig('russian_alliance').glow,
  },
  middle_east_islamic_alliance: {
    id: 'middle_east_islamic_alliance',
    name: '中东·和平联盟',
    shortName: 'MEP',
    emblem: 'M',
    iconUrl: '/assets/icons/wpc/alliance-middle-east.svg',
    stance: '观望',
    stanceTone: 'watch',
    satisfaction: 55,
    demand: '举行能源走廊协调会议',
    color: getFactionConfig('middle_east_islamic_alliance').color,
    glow: getFactionConfig('middle_east_islamic_alliance').glow,
  },
  african_union: {
    id: 'african_union',
    name: '非洲团结联盟',
    shortName: 'AFR',
    emblem: 'A',
    iconUrl: '/assets/icons/wpc/alliance-africa.svg',
    stance: '友好',
    stanceTone: 'friendly',
    satisfaction: 74,
    demand: '设立人道援助与发展基金',
    color: getFactionConfig('african_union').color,
    glow: getFactionConfig('african_union').glow,
  },
  latin_american_south_american_alliance: {
    id: 'latin_american_south_american_alliance',
    name: '拉美·南美联盟',
    shortName: 'LAT',
    emblem: 'L',
    iconUrl: '/assets/icons/wpc/alliance-latin.svg',
    stance: '中立',
    stanceTone: 'neutral',
    satisfaction: 58,
    demand: '稳定全球粮食市场价格',
    color: getFactionConfig('latin_american_south_american_alliance').color,
    glow: getFactionConfig('latin_american_south_american_alliance').glow,
  },
  southeast_asia_alliance: {
    id: 'southeast_asia_alliance',
    name: '东南亚联盟',
    shortName: 'SEA',
    emblem: 'S',
    iconUrl: '/assets/icons/wpc/alliance-southeast-asia.svg',
    stance: '支持',
    stanceTone: 'support',
    satisfaction: 66,
    demand: '保障供应链安全与畅通',
    color: getFactionConfig('southeast_asia_alliance').color,
    glow: getFactionConfig('southeast_asia_alliance').glow,
  },
};

export const councilAlliances = allianceOrder.map((id) => allianceProfiles[id]);

export const observerAlliance = {
  id: 'neutral' as const,
  name: '理事会观察区',
  shortName: 'OBS',
  emblem: 'O',
  color: neutralFaction.color,
  glow: neutralFaction.glow,
};

export type WorldMetricTone = 'red' | 'green' | 'yellow' | 'blue' | 'orange';

export type WorldMetric = {
  id: string;
  label: string;
  icon: string;
  value: number;
  max: number;
  tone: WorldMetricTone;
};

export const worldMetrics: WorldMetric[] = [
  { id: 'tension', label: '全球紧张度', icon: '!', value: 68, max: 100, tone: 'red' },
  { id: 'stability', label: '世界稳定度', icon: '+', value: 57, max: 100, tone: 'green' },
  { id: 'aiRisk', label: 'AI 风险指数', icon: 'AI', value: 37, max: 100, tone: 'yellow' },
  { id: 'economy', label: '经济压力', icon: '$', value: 52, max: 100, tone: 'blue' },
  { id: 'humanitarian', label: '人道危机', icon: 'H', value: 45, max: 100, tone: 'orange' },
];

export const headerStatus = {
  tension: '68 / 100',
  peace: '42%',
  aiRisk: '37 / 100',
};

export type TurnEventRisk = string;

export type TurnEvent = {
  id: string;
  title: string;
  risk: TurnEventRisk;
  topic: string;
};

export const turnEvents: TurnEvent[] = [
  { id: 'energy-corridor', title: '中东能源走廊遭网络袭击', risk: '高危', topic: '能源' },
  { id: 'military-drill', title: '北约宣布扩大军演规模', risk: '高危', topic: '军演' },
  { id: 'food-price', title: '全球粮食价格连续上涨', risk: '中危', topic: '粮食' },
  { id: 'refugee-wave', title: '难民潮逼近边境缓冲区', risk: '中危', topic: '难民' },
  { id: 'ai-regulation', title: '联合国AI监管草案待表决', risk: '机会', topic: 'AI监管' },
];

export const focusTopics = ['军演', '能源', '粮食', '难民', 'AI监管'];

export const keyRisks = [
  '能源走廊中断可能引发区域冲突升级',
  '军演误判风险高，可能触发意外冲突',
  '网络攻击扩散，关键基础设施受威胁',
  '粮食价格持续上涨引发社会不稳定',
];

export const diplomaticActions = ['谈判', '交换条件', '让步', '调查', '制裁', '援助', '联合项目', '紧急峰会'];

export const aiReactions = [
  {
    allianceId: 'north_american_western_alliance',
    reaction: '接受讨论军事透明机制，但要求俄方同步让步。',
    status: '接受讨论',
  },
  {
    allianceId: 'russian_alliance',
    reaction: '原则上同意会谈，前提是暂停边境部署升级。',
    status: '有条件同意',
  },
  {
    allianceId: 'middle_east_islamic_alliance',
    reaction: '愿意开放能源协调会议，并要求保障走廊中立性。',
    status: '积极响应',
  },
  {
    allianceId: 'african_union',
    reaction: '支持联合调查，但要求人道援助配套。',
    status: '接受讨论',
  },
  {
    allianceId: 'zhonghua_alliance',
    reaction: '支持将AI监管草案纳入峰会议程。',
    status: '积极响应',
  },
] satisfies Array<{ allianceId: AllianceId; reaction: string; status: string }>;

export const settlementResults = [
  { label: '能源走廊网络袭击', result: '部分缓解', tone: 'yellow' },
  { label: '扩大军演误判风险', result: '已缓解', tone: 'green' },
  { label: '全球粮食价格上涨', result: '未解决', tone: 'red' },
] as const;

export const nextTurnWarnings = ['粮食价格仍处高位，拉美与非洲将要求更多市场干预。', 'AI监管草案若延迟表决，AI风险指数可能上升。'];

export const proposalImpact = [
  { label: '全球紧张度', value: '-10', tone: 'green' },
  { label: '世界稳定度', value: '+6', tone: 'green' },
  { label: 'AI 风险', value: '-2', tone: 'green' },
  { label: '经济压力', value: '+1', tone: 'yellow' },
] as const;

export const countryAllianceMap: Record<string, AllianceId> = {
  US: 'north_american_western_alliance',
  USA: 'north_american_western_alliance',
  CA: 'north_american_western_alliance',
  CAN: 'north_american_western_alliance',
  MX: 'north_american_western_alliance',
  MEX: 'north_american_western_alliance',
  GB: 'north_american_western_alliance',
  GBR: 'north_american_western_alliance',
  IE: 'north_american_western_alliance',
  IRL: 'north_american_western_alliance',
  FR: 'north_american_western_alliance',
  FRA: 'north_american_western_alliance',
  DE: 'north_american_western_alliance',
  DEU: 'north_american_western_alliance',
  IT: 'north_american_western_alliance',
  ITA: 'north_american_western_alliance',
  ES: 'north_american_western_alliance',
  ESP: 'north_american_western_alliance',
  PT: 'north_american_western_alliance',
  PRT: 'north_american_western_alliance',
  NL: 'north_american_western_alliance',
  NLD: 'north_american_western_alliance',
  BE: 'north_american_western_alliance',
  BEL: 'north_american_western_alliance',
  PL: 'north_american_western_alliance',
  POL: 'north_american_western_alliance',
  JP: 'north_american_western_alliance',
  JPN: 'north_american_western_alliance',
  KR: 'north_american_western_alliance',
  KOR: 'north_american_western_alliance',
  AU: 'north_american_western_alliance',
  AUS: 'north_american_western_alliance',
  NZ: 'north_american_western_alliance',
  NZL: 'north_american_western_alliance',
  IL: 'north_american_western_alliance',
  ISR: 'north_american_western_alliance',

  CN: 'zhonghua_alliance',
  CHN: 'zhonghua_alliance',
  TW: 'zhonghua_alliance',
  TWN: 'zhonghua_alliance',
  HK: 'zhonghua_alliance',
  HKG: 'zhonghua_alliance',
  MO: 'zhonghua_alliance',
  MAC: 'zhonghua_alliance',
  MN: 'zhonghua_alliance',
  MNG: 'zhonghua_alliance',
  KP: 'zhonghua_alliance',
  PRK: 'zhonghua_alliance',
  PK: 'zhonghua_alliance',
  PAK: 'zhonghua_alliance',

  RU: 'russian_alliance',
  RUS: 'russian_alliance',
  BY: 'russian_alliance',
  BLR: 'russian_alliance',
  KZ: 'russian_alliance',
  KAZ: 'russian_alliance',
  KG: 'russian_alliance',
  KGZ: 'russian_alliance',
  TJ: 'russian_alliance',
  TJK: 'russian_alliance',
  AM: 'russian_alliance',
  ARM: 'russian_alliance',
  AZ: 'russian_alliance',
  AZE: 'russian_alliance',
  RS: 'russian_alliance',
  SRB: 'russian_alliance',
  SY: 'russian_alliance',
  SYR: 'russian_alliance',

  SA: 'middle_east_islamic_alliance',
  SAU: 'middle_east_islamic_alliance',
  IR: 'middle_east_islamic_alliance',
  IRN: 'middle_east_islamic_alliance',
  AE: 'middle_east_islamic_alliance',
  ARE: 'middle_east_islamic_alliance',
  QA: 'middle_east_islamic_alliance',
  QAT: 'middle_east_islamic_alliance',
  OM: 'middle_east_islamic_alliance',
  OMN: 'middle_east_islamic_alliance',
  IQ: 'middle_east_islamic_alliance',
  IRQ: 'middle_east_islamic_alliance',
  TR: 'middle_east_islamic_alliance',
  TUR: 'middle_east_islamic_alliance',
  EG: 'middle_east_islamic_alliance',
  EGY: 'middle_east_islamic_alliance',
  LY: 'middle_east_islamic_alliance',
  LBY: 'middle_east_islamic_alliance',
  DZ: 'middle_east_islamic_alliance',
  DZA: 'middle_east_islamic_alliance',
  MA: 'middle_east_islamic_alliance',
  MAR: 'middle_east_islamic_alliance',
  TN: 'middle_east_islamic_alliance',
  TUN: 'middle_east_islamic_alliance',

  NG: 'african_union',
  NGA: 'african_union',
  ZA: 'african_union',
  ZAF: 'african_union',
  KE: 'african_union',
  KEN: 'african_union',
  ET: 'african_union',
  ETH: 'african_union',

  BR: 'latin_american_south_american_alliance',
  BRA: 'latin_american_south_american_alliance',
  AR: 'latin_american_south_american_alliance',
  ARG: 'latin_american_south_american_alliance',
  CL: 'latin_american_south_american_alliance',
  CHL: 'latin_american_south_american_alliance',
  PE: 'latin_american_south_american_alliance',
  PER: 'latin_american_south_american_alliance',
  CO: 'latin_american_south_american_alliance',
  COL: 'latin_american_south_american_alliance',
  VE: 'latin_american_south_american_alliance',
  VEN: 'latin_american_south_american_alliance',

  SG: 'southeast_asia_alliance',
  SGP: 'southeast_asia_alliance',
  ID: 'southeast_asia_alliance',
  IDN: 'southeast_asia_alliance',
  VN: 'southeast_asia_alliance',
  VNM: 'southeast_asia_alliance',
  TH: 'southeast_asia_alliance',
  THA: 'southeast_asia_alliance',
  MY: 'southeast_asia_alliance',
  MYS: 'southeast_asia_alliance',
  PH: 'southeast_asia_alliance',
  PHL: 'southeast_asia_alliance',
  KH: 'southeast_asia_alliance',
  KHM: 'southeast_asia_alliance',
  LA: 'southeast_asia_alliance',
  LAO: 'southeast_asia_alliance',
  MM: 'southeast_asia_alliance',
  MMR: 'southeast_asia_alliance',
  BN: 'southeast_asia_alliance',
  BRN: 'southeast_asia_alliance',
};

export type GlobeSelection = {
  kind: 'country' | 'city';
  countryName: string;
  cityName?: string;
  isoA3: string;
  allianceId: FactionDisplayId;
  allianceName: string;
  allianceColor: string;
  allianceGlow: string;
  influence: number;
  stability: number;
};

export function getAllianceForCountryCode(code?: string, continent?: unknown): AllianceProfile | undefined {
  const normalized = code?.toUpperCase();
  const allianceId = normalized ? countryAllianceMap[normalized] : undefined;

  if (allianceId) {
    return allianceProfiles[allianceId];
  }

  if ((normalized && AFRICA_ISO_A3_SET.has(normalized)) || continent === 'Africa') {
    return allianceProfiles.african_union;
  }

  return undefined;
}

function getCountryDisplayName(isoA3: string, fallback?: string): string {
  return fallback || countryNames[isoA3] || isoA3;
}

function metricSeed(value: string): number {
  return value.split('').reduce((total, char) => total + char.charCodeAt(0), 0);
}

export function createGlobeSelection({
  kind,
  isoA3,
  countryName,
  cityName,
  continent,
}: {
  kind: 'country' | 'city';
  isoA3: string;
  countryName?: string;
  cityName?: string;
  continent?: unknown;
}): GlobeSelection {
  const normalized = isoA3.toUpperCase();
  const alliance = getAllianceForCountryCode(normalized, continent);
  const seed = metricSeed(normalized);
  const selectedAlliance = alliance ?? observerAlliance;
  const isObserver = selectedAlliance.id === 'neutral';

  return {
    kind,
    countryName: getCountryDisplayName(normalized, countryName),
    cityName,
    isoA3: normalized,
    allianceId: selectedAlliance.id,
    allianceName: selectedAlliance.name,
    allianceColor: selectedAlliance.color,
    allianceGlow: selectedAlliance.glow,
    influence: isObserver ? 38 + (seed % 12) : 62 + (seed % 25),
    stability: isObserver ? 50 + (seed % 18) : 48 + (seed % 34),
  };
}
