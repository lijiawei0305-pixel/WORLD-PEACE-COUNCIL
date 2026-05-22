import type { AllianceState, DiplomaticProposal, RoundEvent, WorldState } from './types.ts';

type GenerateEventsPromptInput = {
  round: number;
  worldState: WorldState;
  alliances: AllianceState[];
  historySummary?: string;
};

type EvaluateProposalPromptInput = {
  round: number;
  worldState: WorldState;
  alliances: AllianceState[];
  events: RoundEvent[];
  proposal: DiplomaticProposal;
  historySummary?: string;
};

type RoundSettlementPromptInput = {
  round: number;
  worldState: WorldState;
  alliances: AllianceState[];
  events: RoundEvent[];
  proposal: DiplomaticProposal;
  adjudication: unknown;
  historySummary?: string;
};

export const WORLD_PEACE_COUNCIL_SYSTEM_PROMPT = [
  '你是《世界和平理事会》的快速裁判引擎。',
  '目标：用最少 token 输出可被 JSON.parse 和 Zod 校验的 JSON。',
  '玩家是“首席秩序架构师”，只能提交外交提案，不能命令联盟。',
  '联盟会基于利益、诉求、底线做出克制反应。',
  '不要展示推理过程。不要解释规则。不要输出 markdown。',
  '只输出一个 JSON 对象，不要代码块，不要前后缀。',
  '所有中文文本保持短句：title <= 18字，description <= 70字，summary <= 90字，reason <= 60字。',
  '不要生成宏大叙事，不要一次解决所有危机。',
  '数值变化必须保守，且只作为建议，最终由规则引擎裁定。',
].join('\n');

function serializePromptData(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

const EVENT_TYPE_VALUES = 'MILITARY | ENERGY | CYBER | AI | FOOD | REFUGEE | ECONOMY | DIPLOMACY | SUPPLY_CHAIN';
const EVENT_SEVERITY_VALUES = 'HIGH | MEDIUM | LOW | OPPORTUNITY';
const EVENT_RESOLUTION_STATUS_VALUES = 'RESOLVED | PARTIALLY_RESOLVED | UNCHANGED | WORSENED';
const ALLIANCE_ATTITUDE_VALUES = 'ACCEPT | ACCEPT_CONDITIONALLY | NEUTRAL | CONCERNED | REJECT';
const GAME_STATUS_VALUES = 'ACTIVE | WON | FAILED | COLD_PEACE | ABANDONED';

const METRIC_CHANGE_KEYS = [
  'globalTension',
  'worldStability',
  'aiRisk',
  'economicPressure',
  'humanitarianCrisis',
  'peaceAgreement',
].join(', ');

export function buildGenerateEventsPrompt(input: GenerateEventsPromptInput): string {
  return [
    '任务：生成当前回合的随机世界事件。',
    '速度优先：固定生成 exactly 3 个事件。',
    '每个事件只保留必要信息，避免长段叙事。',
    'type 只能是：MILITARY, ENERGY, CYBER, AI, FOOD, REFUGEE, ECONOMY, DIPLOMACY, SUPPLY_CHAIN。',
    'severity 只能是：HIGH, MEDIUM, LOW, OPPORTUNITY。',
    'involvedAlliances 使用联盟 id。',
    'potentialImpact 只填写真正变化的字段，数字必须小。',
    '推荐行动最多 2 条。',
    '',
    '输出 JSON 形状：',
    `{
      "events": [
        {
          "title": "短标题",
          "type": "ENERGY",
          "severity": "MEDIUM",
          "description": "70字以内事件描述",
          "involvedAlliances": ["middle_east"],
          "potentialImpact": {"globalTension": 3, "economicPressure": 2},
          "recommendedActions": ["联合调查", "临时担保"],
          "unresolvedConsequence": "50字以内后果"
        }
      ],
      "roundBriefing": "90字以内简报",
      "priorityIssue": "20字以内优先议题"
    }`,
    '',
    '输入：',
    JSON.stringify({
      round: input.round,
      worldState: input.worldState,
      alliances: input.alliances.map((alliance) => ({
        id: alliance.allianceId,
        stance: alliance.stance,
        satisfaction: alliance.satisfaction,
        demand: alliance.currentDemand,
      })),
      historySummary: input.historySummary ?? '',
    }),
  ].join('\n');
}

export function buildEvaluateProposalPrompt(input: EvaluateProposalPromptInput): string {
  return [
    '任务：快速评估玩家外交提案。',
    '不要长篇分析，只输出结构化裁定。',
    '只评估：被提案点名的联盟 + 当前事件涉及的联盟。',
    '最多输出 5 个 allianceReactions。',
    'reactionText <= 60字，reason <= 60字。',
    'strengths 最多 2 条，weaknesses 最多 2 条。',
    'nextRoundRisks 最多 2 条。',
    'attitude 只能是：ACCEPT, ACCEPT_CONDITIONALLY, NEUTRAL, CONCERNED, REJECT。',
    'resolutionStatus 只能是：RESOLVED, PARTIALLY_RESOLVED, UNCHANGED, WORSENED。',
    'expectedImpact 只填写实际变化字段，保持保守。',
    '',
    '输出 JSON 形状：',
    `{
      "proposalUnderstanding": {
        "mainGoal": "60字以内",
        "mentionedAlliances": ["north_west"],
        "actionTypes": ["谈判"],
        "targetEvents": ["事件标题"]
      },
      "allianceReactions": [
        {
          "alliance": "north_west",
          "attitude": "ACCEPT_CONDITIONALLY",
          "reactionText": "60字以内",
          "reason": "60字以内",
          "satisfactionDelta": 3
        }
      ],
      "aiAssessment": {
        "successProbability": 60,
        "summary": "90字以内",
        "strengths": ["短句"],
        "weaknesses": ["短句"],
        "expectedImpact": {"globalTension": -3, "peaceAgreement": 2}
      },
      "eventResolutionForecast": [
        {
          "eventTitle": "事件标题",
          "resolutionStatus": "PARTIALLY_RESOLVED",
          "reason": "60字以内",
          "expectedImpact": {"globalTension": -1}
        }
      ],
      "nextRoundRisks": [
        {
          "title": "短标题",
          "type": "DIPLOMACY",
          "severity": "MEDIUM",
          "description": "70字以内",
          "involvedAlliances": ["north_west"]
        }
      ]
    }`,
    '',
    '输入：',
    JSON.stringify({
      round: input.round,
      worldState: input.worldState,
      alliances: input.alliances.map((alliance) => ({
        id: alliance.allianceId,
        stance: alliance.stance,
        satisfaction: alliance.satisfaction,
        demand: alliance.currentDemand,
        lastReaction: alliance.lastReaction,
      })),
      events: input.events.map((event) => ({
        title: event.title,
        type: event.type,
        severity: event.severity,
        alliances: event.involvedAlliances,
        impact: event.potentialImpact,
      })),
      proposal: input.proposal.proposalText,
      historySummary: input.historySummary ?? '',
    }),
  ].join('\n');
}

export function buildRoundSettlementPrompt(input: RoundSettlementPromptInput): string {
  return [
    '请基于当前世界状态、事件、玩家提案和 AI 裁定草案，生成回合叙事结算。',
    '结算必须克制，不能把全部危机一次性解决。',
    '数值变化必须保持在单回合限制内，并保留下一回合风险。',
    '输出必须严格匹配 RoundSettlementOutputSchema。',
    '只能输出指定字段名，禁止额外字段。',
    `eventResults.resolutionStatus 只能使用这些英文枚举：${EVENT_RESOLUTION_STATUS_VALUES}。`,
    `gameStatus 只能使用这些英文枚举：${GAME_STATUS_VALUES}。`,
    `metricChanges 和 eventResults.metricChanges 只能包含这些可选数字字段：${METRIC_CHANGE_KEYS}。`,
    'alliance 字段优先使用联盟 id，例如 north_west、china、russia。',
    '不要包含 markdown。',
    '',
    '必须输出这个 JSON 形状：',
    serializePromptData({
      round: input.round,
      settlementTitle: '结算标题',
      summary: '结算摘要',
      metricChanges: {
        globalTension: -2,
        peaceAgreement: 1,
      },
      newWorldState: input.worldState,
      eventResults: [
        {
          eventTitle: '事件标题',
          resolutionStatus: 'PARTIALLY_RESOLVED',
          resultText: '事件结算文本',
          metricChanges: {
            globalTension: -1,
          },
        },
      ],
      allianceChanges: [
        {
          alliance: 'north_west',
          satisfactionDelta: 3,
          newSatisfaction: 61,
          newStance: '合作',
          currentDemand: '当前诉求',
          pressureTags: ['压力标签'],
          lastReaction: '最后反应',
        },
      ],
      nextRoundWarnings: ['下一回合警告'],
      rating: 65,
      ratingText: '有限缓和',
      gameStatus: 'ACTIVE',
    }),
    '',
    '输入数据：',
    serializePromptData({
      round: input.round,
      worldState: input.worldState,
      alliances: input.alliances,
      events: input.events,
      proposal: input.proposal,
      adjudication: input.adjudication,
      historySummary: input.historySummary ?? '',
    }),
    '',
    '输出 JSON 字段：round, settlementTitle, summary, metricChanges, newWorldState, eventResults, allianceChanges, nextRoundWarnings, rating, ratingText, gameStatus。',
  ].join('\n');
}
