import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { GameStatus, EventResolutionStatus } from '../contracts/game';
import type {
  AllianceProfile,
  CouncilStage,
  CouncilStageId,
  TurnEvent,
  WorldMetric,
} from '../data/worldPeaceCouncil';

export type Language = 'zh' | 'en';

const LANGUAGE_STORAGE_KEY = 'wpc.language';

const dictionary = {
  zh: {
    authLanguage: '界面语言',
    authTagline: '登录或创建账号开启你的首席秩序架构师任期',
    signin: '登录',
    signup: '注册',
    email: '邮箱',
    password: '密码',
    confirmPassword: '确认密码',
    passwordSignupPlaceholder: '至少 6 位',
    passwordSigninPlaceholder: '请输入密码',
    confirmPasswordPlaceholder: '再次输入密码',
    passwordMismatch: '两次输入的密码不一致。',
    passwordTooShort: '密码至少 6 位。',
    signinFailed: '登录失败，请检查邮箱或密码。',
    signupSubmitted: '注册申请已提交。如果项目开启了邮箱验证，请打开邮件中的链接后回到此页面登录。',
    submittingSignin: '登录中...',
    submittingSignup: '注册中...',
    signupSubmit: '创建账号并进入',
    haveAccount: '已有账号？',
    switchSignin: '切换到登录',
    firstTime: '第一次来？',
    createAccount: '创建账号',
    authFootnote: '注册即接受将本浏览器登录信息保存为 Supabase 会话。每个账号拥有独立的世界存档，从第 1 回合开始。',
    brand: '世界和平理事会',
    brandRole: '首席秩序架构师',
    round: '回合',
    keyStatus: '关键状态',
    help: '帮助',
    settings: '设置',
    notifications: '通知',
    signOut: '退出登录',
    newGame: '创建新游戏',
    syncing: '同步中',
    objectivePanel: '游戏目标 / 世界状态',
    mainObjective: '主要目标',
    objectiveText: '在 20 回合内避免世界大战',
    failCondition: '失败条件',
    failConditionText: '全球紧张度 >= 100',
    crisisCount: '本回合危机数',
    currentStage: '当前阶段',
    gameStatus: '游戏状态',
    alliancesOverview: '七大联盟概览',
    briefing: '本回合简报',
    alliance: '联盟',
    stance: '立场',
    satisfaction: '满意度',
    cityNode: '城市节点',
    countryArea: '国家区域',
    country: '国家',
    influence: '影响力',
    stability: '稳定度',
    allianceBelonging: '所属联盟',
    eventsThisRound: '本回合事件',
    waitingEvents: '等待生成本回合随机事件。',
    eventInfo: '事件说明',
    eventInfoReady: 'AI 已基于当前全球态势生成本回合随机事件，请审阅事件列表与说明，下一步将进入局势总览阶段。',
    eventInfoEmpty: '点击底部控制台按钮后，后端会调用 AI 生成本回合事件并保存到数据库。',
    focusTopics: '可关注议题',
    noEventsRead: '尚未读取到本回合事件。',
    keyRisks: '关键风险',
    allianceDemands: '联盟诉求',
    eventSummaryPrompt: '请先生成并审阅本回合事件。',
    actions: '可用行动方式',
    appendAction: '点击追加"{action}"到提案',
    aiRuling: 'AI裁定 / 联盟反应',
    aiAssessment: 'AI综合评估',
    assessmentDone: '已基于提交内容完成模拟。',
    assessmentEmpty: '尚未检测到正式提案，当前使用默认多边降温方案预估。',
    settlementDetails: '结算明细',
    nextRoundWarning: '下一回合预警',
    roundRating: '本回合评价',
    fallbackRating: '积极推动多边对话，局势显著改善。',
    proposalConsole: '外交提案控制台',
    mentionMenu: '@ 联盟自动补全',
    chooseAlliance: '选择联盟',
    mentionEmpty: '未匹配到联盟，删除 @ 后面的文字可查看完整列表。',
    chooseHotkey: '↑↓ 选择',
    confirmHotkey: 'Enter 确认',
    clickInsert: '点击插入',
    proposalPlaceholder: '输入外交提案，例如：@北美·西方联盟 @俄罗斯联邦 建立军事热线，并由 @中东·和平联盟 主持能源安全会谈',
    submitProposal: '提交提案',
    submittingProposal: '提交中...',
    proposalCount: '本回合提案次数',
    noProposalFallback: '未提交正式提案，系统将使用保守降温方案。',
    settledDisplay: '本回合已结算',
    gameEnded: '游戏已结束',
    connectOrCreate: '连接 / 创建游戏',
    retryConnect: '重试连接',
    connectionFailed: '云端连接失败，请按下方提示处理后重试。',
    connectingBackend: '正在连接云端游戏后端，必要时会创建一局新的游戏。',
    eventsReady: '本回合事件已生成，可进入局势总览。',
    finalRound: '最终回合',
    startNewGame: '开始新局',
    peaceProgress: '和平协议进度',
    wonTitle: '和平达成',
    lostTitle: '文明崩溃',
    stalemateTitle: '冷和平',
    wonSubtitle: '第 {round} 回合达成和平框架。',
    lostSubtitle: '全球紧张度突破红线，世界秩序崩溃。',
    stalemateSubtitle: '世界维持在紧张的平衡中。',
  },
  en: {
    authLanguage: 'Interface Language',
    authTagline: 'Sign in or create an account to begin your mandate as Chief Order Architect',
    signin: 'Sign In',
    signup: 'Register',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    passwordSignupPlaceholder: 'At least 6 characters',
    passwordSigninPlaceholder: 'Enter password',
    confirmPasswordPlaceholder: 'Enter password again',
    passwordMismatch: 'The two passwords do not match.',
    passwordTooShort: 'Password must be at least 6 characters.',
    signinFailed: 'Sign-in failed. Check your email or password.',
    signupSubmitted: 'Registration submitted. If email confirmation is enabled, open the email link and return here to sign in.',
    submittingSignin: 'Signing in...',
    submittingSignup: 'Creating...',
    signupSubmit: 'Create Account',
    haveAccount: 'Already have an account?',
    switchSignin: 'Switch to sign in',
    firstTime: 'First time here?',
    createAccount: 'Create account',
    authFootnote: 'Registration saves a Supabase session in this browser. Each account has an independent world save starting from Round 1.',
    brand: 'World Peace Council',
    brandRole: 'Chief Order Architect',
    round: 'Round',
    keyStatus: 'Key Status',
    help: 'Help',
    settings: 'Settings',
    notifications: 'Notifications',
    signOut: 'Sign Out',
    newGame: 'New Game',
    syncing: 'Syncing',
    objectivePanel: 'Objective / World State',
    mainObjective: 'Primary Objective',
    objectiveText: 'Prevent world war within 20 rounds',
    failCondition: 'Failure Condition',
    failConditionText: 'Global Tension >= 100',
    crisisCount: 'Round Crises',
    currentStage: 'Current Stage',
    gameStatus: 'Game Status',
    alliancesOverview: 'Seven Alliances',
    briefing: 'Round Briefing',
    alliance: 'Alliance',
    stance: 'Stance',
    satisfaction: 'Satisfaction',
    cityNode: 'City Node',
    countryArea: 'Country Area',
    country: 'Country',
    influence: 'Influence',
    stability: 'Stability',
    allianceBelonging: 'Alliance',
    eventsThisRound: 'Round Events',
    waitingEvents: 'Waiting for random events.',
    eventInfo: 'Event Notes',
    eventInfoReady: 'AI has generated this round of events from the current global situation. Review the list before moving to the overview.',
    eventInfoEmpty: 'Use the bottom console to call the backend AI, generate this round of events, and save them to the database.',
    focusTopics: 'Focus Topics',
    noEventsRead: 'No round events have been loaded yet.',
    keyRisks: 'Key Risks',
    allianceDemands: 'Alliance Demands',
    eventSummaryPrompt: 'Generate and review this round of events first.',
    actions: 'Available Actions',
    appendAction: 'Append "{action}" to the proposal',
    aiRuling: 'AI Ruling / Alliance Reactions',
    aiAssessment: 'AI Assessment',
    assessmentDone: 'Simulation completed from the submitted proposal.',
    assessmentEmpty: 'No formal proposal detected. Estimating with a conservative multilateral de-escalation plan.',
    settlementDetails: 'Settlement Details',
    nextRoundWarning: 'Next Round Warnings',
    roundRating: 'Round Rating',
    fallbackRating: 'Multilateral dialogue improved the situation.',
    proposalConsole: 'Diplomatic Proposal Console',
    mentionMenu: '@ Alliance Autocomplete',
    chooseAlliance: 'Choose Alliance',
    mentionEmpty: 'No matching alliance. Delete the text after @ to see the full list.',
    chooseHotkey: '↑↓ Select',
    confirmHotkey: 'Enter Confirm',
    clickInsert: 'Click Insert',
    proposalPlaceholder: 'Enter a diplomatic proposal, e.g. @North American-Western Alliance @Russian Federation establish a military hotline, with @Middle East Peace Alliance hosting energy security talks',
    submitProposal: 'Submit Proposal',
    submittingProposal: 'Submitting...',
    proposalCount: 'Round proposals',
    noProposalFallback: 'No formal proposal submitted. The system will use a conservative de-escalation plan.',
    settledDisplay: 'This round has been settled',
    gameEnded: 'Game ended',
    connectOrCreate: 'Connect / Create Game',
    retryConnect: 'Retry Connection',
    connectionFailed: 'Cloud connection failed. Follow the message below and retry.',
    connectingBackend: 'Connecting to the cloud game backend. A new game may be created if needed.',
    eventsReady: 'Round events are ready. Move to the situation overview.',
    finalRound: 'Final Round',
    startNewGame: 'Start New Game',
    peaceProgress: 'Peace Agreement',
    wonTitle: 'Peace Achieved',
    lostTitle: 'Civilization Collapse',
    stalemateTitle: 'Cold Peace',
    wonSubtitle: 'A peace framework was reached in Round {round}.',
    lostSubtitle: 'Global tension crossed the red line and world order collapsed.',
    stalemateSubtitle: 'The world remains in a tense balance.',
  },
} as const;

type TranslationKey = keyof typeof dictionary.zh;

const languageContext = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
} | null>(null);

function readInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'zh';
  return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'zh';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readInitialLanguage);

  useEffect(() => {
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage: setLanguageState,
    t: (key: TranslationKey, params?: Record<string, string | number>) => {
      let text = dictionary[language][key] ?? dictionary.zh[key];
      if (params) {
        for (const [param, value] of Object.entries(params)) {
          text = text.replaceAll(`{${param}}`, String(value)) as typeof text;
        }
      }
      return text;
    },
  }), [language]);

  return <languageContext.Provider value={value}>{children}</languageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(languageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}

export function formatRoundDate(round: number, language: Language): string {
  const date = new Date(Date.UTC(2038, 0, 18));
  date.setUTCMonth(date.getUTCMonth() + round - 1);
  return language === 'en'
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date)
    : `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

const stageCopy: Record<CouncilStageId, Record<Language, Pick<CouncilStage, 'label' | 'statusLabel' | 'helpText'>>> = {
  events: {
    zh: { label: '随机事件', statusLabel: '随机事件生成', helpText: 'AI 已基于当前全球态势生成本回合随机事件。' },
    en: { label: 'Random Events', statusLabel: 'Event Generation', helpText: 'AI has generated random events for this round.' },
  },
  overview: {
    zh: { label: '局势总览', statusLabel: '局势研判', helpText: '审阅关键风险和联盟诉求后，进入外交提案阶段。' },
    en: { label: 'Situation Overview', statusLabel: 'Situation Review', helpText: 'Review key risks and alliance demands before drafting a proposal.' },
  },
  proposal: {
    zh: { label: '外交提案', statusLabel: '外交提案', helpText: '提交一项多边外交提案，协调七大联盟降低战争风险。' },
    en: { label: 'Diplomatic Proposal', statusLabel: 'Proposal Drafting', helpText: 'Submit a multilateral proposal to reduce war risk across the seven alliances.' },
  },
  adjudication: {
    zh: { label: 'AI裁定', statusLabel: 'AI裁定', helpText: 'AI 正在模拟各联盟对提案的反应与综合影响。' },
    en: { label: 'AI Ruling', statusLabel: 'AI Ruling', helpText: 'AI is simulating alliance reactions and overall impact.' },
  },
  settlement: {
    zh: { label: '回合结算', statusLabel: '回合结算', helpText: '本回合事件结果已结算，准备进入下一回合。' },
    en: { label: 'Round Settlement', statusLabel: 'Settlement', helpText: 'Round outcomes are settled. Prepare for the next round.' },
  },
};

export function localizeStage(stage: CouncilStage, language: Language): CouncilStage {
  return { ...stage, ...stageCopy[stage.id][language] };
}

const metricLabels: Record<string, Record<Language, string>> = {
  tension: { zh: '全球紧张度', en: 'Global Tension' },
  stability: { zh: '世界稳定度', en: 'World Stability' },
  aiRisk: { zh: 'AI 风险指数', en: 'AI Risk Index' },
  economy: { zh: '经济压力', en: 'Economic Pressure' },
  humanitarian: { zh: '人道危机', en: 'Humanitarian Crisis' },
  peaceAgreement: { zh: '和平协议', en: 'Peace Agreement' },
};

export function localizeMetric(metric: WorldMetric, language: Language): WorldMetric {
  return { ...metric, label: metricLabels[metric.id]?.[language] ?? metric.label };
}

const allianceNames: Record<string, Record<Language, string>> = {
  north_american_western_alliance: { zh: '北美·西方联盟', en: 'North American-Western Alliance' },
  zhonghua_alliance: { zh: '中华联盟', en: 'Zhonghua Alliance' },
  russian_alliance: { zh: '俄罗斯联邦', en: 'Russian Federation' },
  middle_east_islamic_alliance: { zh: '中东·和平联盟', en: 'Middle East Peace Alliance' },
  african_union: { zh: '非洲团结联盟', en: 'African Unity Alliance' },
  latin_american_south_american_alliance: { zh: '拉美·南美联盟', en: 'Latin American-South American Alliance' },
  southeast_asia_alliance: { zh: '东南亚联盟', en: 'Southeast Asia Alliance' },
  neutral: { zh: '理事会观察区', en: 'Council Observer Zone' },
};

const backendAllianceIdToDisplayId: Record<string, string> = {
  north_west: 'north_american_western_alliance',
  china: 'zhonghua_alliance',
  russia: 'russian_alliance',
  middle_east: 'middle_east_islamic_alliance',
  africa: 'african_union',
  latin_america: 'latin_american_south_american_alliance',
  southeast_asia: 'southeast_asia_alliance',
};

const allianceDemands: Record<string, Record<Language, string>> = {
  north_american_western_alliance: { zh: '建立军事透明机制', en: 'Establish military transparency mechanisms' },
  zhonghua_alliance: { zh: '推动国际AI治理框架落地', en: 'Implement an international AI governance framework' },
  russian_alliance: { zh: '保障边境安全与战略缓冲', en: 'Secure borders and strategic buffer zones' },
  middle_east_islamic_alliance: { zh: '举行能源走廊协调会议', en: 'Hold energy corridor coordination talks' },
  african_union: { zh: '设立人道援助与发展基金', en: 'Create a humanitarian aid and development fund' },
  latin_american_south_american_alliance: { zh: '稳定全球粮食市场价格', en: 'Stabilize global food market prices' },
  southeast_asia_alliance: { zh: '保障供应链安全与畅通', en: 'Protect supply chain security and continuity' },
};

const stanceLabels: Record<string, Record<Language, string>> = {
  友好: { zh: '友好', en: 'Friendly' },
  支持: { zh: '支持', en: 'Supportive' },
  合作: { zh: '合作', en: 'Cooperative' },
  中立: { zh: '中立', en: 'Neutral' },
  观望: { zh: '观望', en: 'Watching' },
  警惕: { zh: '警惕', en: 'Alert' },
  强硬: { zh: '强硬', en: 'Hardline' },
  敌对: { zh: '敌对', en: 'Hostile' },
};

function normalizeAllianceId(idOrName: string): string {
  const byBackend = backendAllianceIdToDisplayId[idOrName];
  if (byBackend) return byBackend;
  const exact = Object.entries(allianceNames).find(([, names]) => names.zh === idOrName || names.en === idOrName);
  return exact?.[0] ?? idOrName;
}

export function localizeAllianceName(idOrName: string, language: Language): string {
  return allianceNames[normalizeAllianceId(idOrName)]?.[language] ?? idOrName;
}

export function localizeAllianceProfile(alliance: AllianceProfile, language: Language): AllianceProfile {
  const id = normalizeAllianceId(alliance.id);
  return {
    ...alliance,
    name: allianceNames[id]?.[language] ?? localizeAllianceName(alliance.name, language),
    stance: stanceLabels[alliance.stance]?.[language] ?? alliance.stance,
    demand: allianceDemands[id]?.[language] ?? alliance.demand,
  };
}

export function localizeAlliances(alliances: AllianceProfile[], language: Language): AllianceProfile[] {
  return alliances.map((alliance) => localizeAllianceProfile(alliance, language));
}

const riskLabels: Record<string, Record<Language, string>> = {
  HIGH: { zh: '高危', en: 'High' },
  MEDIUM: { zh: '中危', en: 'Medium' },
  LOW: { zh: '中危', en: 'Medium' },
  OPPORTUNITY: { zh: '机会', en: 'Opportunity' },
  高危: { zh: '高危', en: 'High' },
  中危: { zh: '中危', en: 'Medium' },
  机会: { zh: '机会', en: 'Opportunity' },
};

export function localizeRisk(value: string, language: Language): string {
  return riskLabels[value]?.[language] ?? value;
}

export function riskTone(value: string): string {
  if (value === 'HIGH' || value === '高危' || value === 'High') return 'high';
  if (value === 'OPPORTUNITY' || value === '机会' || value === 'Opportunity') return 'chance';
  return 'mid';
}

const eventTypeLabels: Record<string, Record<Language, string>> = {
  MILITARY: { zh: '军事', en: 'Military' },
  ENERGY: { zh: '能源', en: 'Energy' },
  CYBER: { zh: '网络', en: 'Cyber' },
  AI: { zh: 'AI', en: 'AI' },
  FOOD: { zh: '粮食', en: 'Food' },
  REFUGEE: { zh: '难民', en: 'Refugee' },
  ECONOMY: { zh: '经济', en: 'Economy' },
  DIPLOMACY: { zh: '外交', en: 'Diplomacy' },
  SUPPLY_CHAIN: { zh: '供应链', en: 'Supply Chain' },
};

export function localizeEventTopic(typeOrTopic: string, language: Language): string {
  const fromChinese = Object.entries(eventTypeLabels).find(([, labels]) => labels.zh === typeOrTopic);
  return eventTypeLabels[typeOrTopic]?.[language] ?? fromChinese?.[1][language] ?? typeOrTopic;
}

const gameStatusLabels: Record<GameStatus, Record<Language, string>> = {
  ACTIVE: { zh: '在线', en: 'Online' },
  WON: { zh: '胜利', en: 'Victory' },
  FAILED: { zh: '失败', en: 'Failed' },
  COLD_PEACE: { zh: '冷和平', en: 'Cold Peace' },
  ABANDONED: { zh: '已放弃', en: 'Abandoned' },
};

const gameStatusLongLabels: Record<GameStatus, Record<Language, string>> = {
  ACTIVE: { zh: '秩序仍可维持', en: 'Order remains viable' },
  WON: { zh: '和平框架达成', en: 'Peace framework achieved' },
  FAILED: { zh: '世界秩序崩溃', en: 'World order collapsed' },
  COLD_PEACE: { zh: '冷和平结局', en: 'Cold peace outcome' },
  ABANDONED: { zh: '已放弃', en: 'Abandoned' },
};

export function localizeGameStatus(status: GameStatus, language: Language, long = false): string {
  return (long ? gameStatusLongLabels : gameStatusLabels)[status][language];
}

const resolutionLabels: Record<EventResolutionStatus, Record<Language, string>> = {
  RESOLVED: { zh: '已解决', en: 'Resolved' },
  PARTIALLY_RESOLVED: { zh: '部分缓解', en: 'Partially Resolved' },
  UNCHANGED: { zh: '未改变', en: 'Unchanged' },
  WORSENED: { zh: '恶化', en: 'Worsened' },
};

export function localizeResolution(status: EventResolutionStatus | string, language: Language): string {
  return status in resolutionLabels ? resolutionLabels[status as EventResolutionStatus][language] : status;
}

const exactTextTranslations: Record<string, string> = {
  军演: 'Military Drills',
  能源: 'Energy',
  粮食: 'Food',
  难民: 'Refugees',
  AI监管: 'AI Governance',
  谈判: 'Negotiation',
  交换条件: 'Trade-offs',
  让步: 'Concession',
  调查: 'Investigation',
  制裁: 'Sanctions',
  援助: 'Aid',
  联合项目: 'Joint Project',
  紧急峰会: 'Emergency Summit',
  '能源走廊中断可能引发区域冲突升级': 'Energy corridor disruption may escalate regional conflict.',
  '军演误判风险高，可能触发意外冲突': 'Military drill miscalculation could trigger an accidental clash.',
  '网络攻击扩散，关键基础设施受威胁': 'Cyberattacks are spreading and threatening critical infrastructure.',
  '粮食价格持续上涨引发社会不稳定': 'Sustained food price increases are driving social instability.',
  '粮食价格仍处高位，拉美与非洲将要求更多市场干预。': 'Food prices remain high; Latin America and Africa will demand stronger market intervention.',
  'AI监管草案若延迟表决，AI风险指数可能上升。': 'If the AI governance vote is delayed, the AI risk index may rise.',
  部分缓解: 'Partially Eased',
  已缓解: 'Eased',
  未解决: 'Unresolved',
  接受: 'Accept',
  有条件接受: 'Conditional Accept',
  观望: 'Neutral',
  担忧: 'Concerned',
  拒绝: 'Reject',
  接受讨论: 'Open to Talks',
  有条件同意: 'Conditional Agreement',
  积极响应: 'Positive Response',
};

export function localizeText(text: string | undefined, language: Language): string {
  if (!text) return '';
  return language === 'en' ? exactTextTranslations[text] ?? text : text;
}

export function localizeEvent(event: TurnEvent, language: Language): TurnEvent {
  return {
    ...event,
    risk: localizeRisk(event.risk, language),
    topic: localizeEventTopic(event.topic, language),
  };
}

export function getAIPromptLanguage(language: Language): 'zh-CN' | 'en-US' {
  return language === 'en' ? 'en-US' : 'zh-CN';
}
