import {
  EvaluateProposalOutputSchema,
  GenerateEventsOutputSchema,
  RoundSettlementOutputSchema,
} from './aiSchemas.ts';
import {
  buildEvaluateProposalPrompt,
  buildGenerateEventsPrompt,
  buildRoundSettlementPrompt,
  WORLD_PEACE_COUNCIL_SYSTEM_PROMPT,
} from './aiPrompts.ts';

type GenerateEventsInput = Parameters<typeof buildGenerateEventsPrompt>[0];
type EvaluateProposalInput = Parameters<typeof buildEvaluateProposalPrompt>[0];
type RoundSettlementInput = Parameters<typeof buildRoundSettlementPrompt>[0];

type GenerateEventsOutput = ReturnType<typeof GenerateEventsOutputSchema.parse>;
type EvaluateProposalOutput = ReturnType<typeof EvaluateProposalOutputSchema.parse>;
type RoundSettlementOutput = ReturnType<typeof RoundSettlementOutputSchema.parse>;

type SafeParseSchema<TOutput> = {
  safeParse: (value: unknown) =>
    | {
        success: true;
        data: TOutput;
      }
    | {
        success: false;
        error: unknown;
      };
};

type StructuredAIRequest<TOutput> = {
  taskName: string;
  prompt: string;
  temperature: number;
  schema: SafeParseSchema<TOutput>;
  fallback: TOutput;
};

const RETRY_INSTRUCTION = [
  '上一次输出无法通过 JSON schema 校验。',
  '请重新输出严格 JSON。',
  '不得输出 markdown、代码块、解释、注释或额外文本。',
  '字段名、枚举值、数字范围必须完全符合要求。',
].join('\n');

function getEnv(name: string): string | undefined {
  const value = Deno.env.get(name)?.trim();
  return value ? value : undefined;
}

function isMockMode(): boolean {
  return getEnv('AI_MOCK_MODE')?.toLowerCase() !== 'false';
}

function getRequiredEnv(name: string): string {
  const value = getEnv(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getAssistantContent(responseJson: unknown): string {
  if (!isRecord(responseJson) || !Array.isArray(responseJson.choices)) {
    throw new Error('AI response missing choices.');
  }

  const firstChoice = responseJson.choices[0];

  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    throw new Error('AI response missing message.');
  }

  const content = firstChoice.message.content;

  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('AI response content is empty.');
  }

  return content;
}

function parseAIJson(content: string): unknown {
  return JSON.parse(content);
}

async function requestOpenAICompatibleJson(prompt: string, temperature: number): Promise<unknown> {
  const baseUrl = getRequiredEnv('AI_BASE_URL').replace(/\/+$/, '');
  const apiKey = getRequiredEnv('AI_API_KEY');
  const model = getRequiredEnv('AI_MODEL');

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature,
      response_format: {
        type: 'json_object',
      },
      messages: [
        {
          role: 'system',
          content: WORLD_PEACE_COUNCIL_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI request failed with status ${response.status}.`);
  }

  const responseJson: unknown = await response.json();
  return parseAIJson(getAssistantContent(responseJson));
}

function validateAIOutput<TOutput>(
  schema: SafeParseSchema<TOutput>,
  rawOutput: unknown,
  taskName: string,
): TOutput {
  const result = schema.safeParse(rawOutput);

  if (!result.success) {
    console.error(`${taskName}_SCHEMA_VALIDATION_FAILED`, result.error);
    throw new Error(`${taskName} schema validation failed.`);
  }

  return result.data;
}

async function runStructuredAI<TOutput>({
  taskName,
  prompt,
  temperature,
  schema,
  fallback,
}: StructuredAIRequest<TOutput>): Promise<TOutput> {
  if (isMockMode()) {
    return validateAIOutput(schema, fallback, `${taskName}_MOCK`);
  }

  const prompts = [prompt, `${prompt}\n\n${RETRY_INSTRUCTION}`];

  for (const currentPrompt of prompts) {
    try {
      const rawOutput = await requestOpenAICompatibleJson(currentPrompt, temperature);
      return validateAIOutput(schema, rawOutput, taskName);
    } catch (error) {
      console.error(`${taskName}_ATTEMPT_FAILED`, error);
    }
  }

  console.error(`${taskName}_FALLBACK_USED`);
  return validateAIOutput(schema, fallback, `${taskName}_FALLBACK`);
}

function createGenerateEventsFallback(): GenerateEventsOutput {
  return {
    events: [
      {
        title: '能源走廊调度系统遭受网络干扰',
        type: 'ENERGY',
        severity: 'HIGH',
        description: '中东能源走廊的港口调度系统出现异常，多国担心运输延迟会推高能源价格。',
        involvedAlliances: ['middle_east', 'north_west', 'china'],
        potentialImpact: {
          globalTension: 7,
          worldStability: -4,
          economicPressure: 5,
        },
        recommendedActions: ['联合技术调查', '能源通道中立担保', '临时市场稳定协调'],
        unresolvedConsequence: '若攻击来源继续不明，护航和报复性网络行动可能升级。',
      },
      {
        title: '边境军演通告时间窗口缩短',
        type: 'MILITARY',
        severity: 'MEDIUM',
        description: '俄罗斯联邦与北美·西方联盟附近的军演通告窗口缩短，误判风险上升。',
        involvedAlliances: ['russia', 'north_west'],
        potentialImpact: {
          globalTension: 6,
          worldStability: -3,
        },
        recommendedActions: ['恢复热线通报', '交换观察员名单', '限制演训区域'],
        unresolvedConsequence: '若缺少透明机制，下一回合可能出现空域或海域擦枪走火。',
      },
      {
        title: '粮食期货价格连续跳涨',
        type: 'FOOD',
        severity: 'MEDIUM',
        description: '主要粮食品类期货价格连续上涨，非洲与拉美国家要求建立缓冲基金。',
        involvedAlliances: ['africa', 'latin_america', 'southeast_asia'],
        potentialImpact: {
          economicPressure: 6,
          humanitarianCrisis: 4,
          worldStability: -2,
        },
        recommendedActions: ['粮食价格缓冲基金', '出口协调机制', '人道援助快速通道'],
        unresolvedConsequence: '若价格继续上涨，社会稳定和难民压力会在后续回合累积。',
      },
    ],
    roundBriefing: '本回合风险集中在能源、军演误判与粮食价格三条线，任何单一提案都难以同时解决全部压力。',
    priorityIssue: '能源走廊安全与军事误判控制',
  };
}

function createEvaluateProposalFallback(): EvaluateProposalOutput {
  return {
    proposalUnderstanding: {
      mainGoal: '通过联合调查、透明机制和有限援助降低本回合危机外溢风险。',
      mentionedAlliances: ['north_west', 'china', 'russia', 'middle_east', 'africa'],
      actionTypes: ['联合调查', '军事透明', '人道援助', '多边协调'],
      targetEvents: ['能源走廊调度系统遭受网络干扰', '边境军演通告时间窗口缩短'],
    },
    allianceReactions: [
      {
        alliance: 'north_west',
        attitude: 'ACCEPT_CONDITIONALLY',
        reactionText: '愿意参与联合调查和透明通报，但要求俄方同步开放观察机制。',
        reason: '提案回应军事透明诉求，但缺少对违规行动的约束。',
        satisfactionDelta: 4,
      },
      {
        alliance: 'china',
        attitude: 'ACCEPT',
        reactionText: '支持将 AI 与网络安全治理纳入联合调查框架。',
        reason: '提案保留多边治理空间，也避免单边归因升级。',
        satisfactionDelta: 5,
      },
      {
        alliance: 'russia',
        attitude: 'CONCERNED',
        reactionText: '可以讨论热线机制，但反对把责任预设给任何一方。',
        reason: '安全缓冲诉求没有被充分保障。',
        satisfactionDelta: -2,
      },
      {
        alliance: 'middle_east',
        attitude: 'ACCEPT_CONDITIONALLY',
        reactionText: '接受能源走廊中立担保，但要求限制外部军事护航规模。',
        reason: '能源安全诉求被回应，但主权和地区平衡仍是底线。',
        satisfactionDelta: 6,
      },
      {
        alliance: 'africa',
        attitude: 'ACCEPT',
        reactionText: '支持粮食与人道援助快速通道，并要求资金安排明确。',
        reason: '提案缓解粮价和人道压力，但需要实际资源承诺。',
        satisfactionDelta: 5,
      },
    ],
    aiAssessment: {
      successProbability: 63,
      summary: '提案有助于降低短期误判和市场恐慌，但无法一次性解决攻击归因和粮价结构问题。',
      strengths: ['议题覆盖关键风险', '使用多边调查降低归因冲突', '兼顾人道压力'],
      weaknesses: ['缺少强制执行机制', '对俄罗斯安全诉求回应有限', '财政来源不清晰'],
      expectedImpact: {
        globalTension: -5,
        worldStability: 4,
        economicPressure: -2,
        humanitarianCrisis: -2,
        peaceAgreement: 2,
      },
    },
    eventResolutionForecast: [
      {
        eventTitle: '能源走廊调度系统遭受网络干扰',
        resolutionStatus: 'PARTIALLY_RESOLVED',
        reason: '联合调查和中立担保能缓解恐慌，但攻击来源仍需时间确认。',
        expectedImpact: {
          globalTension: -4,
          economicPressure: -2,
        },
      },
      {
        eventTitle: '边境军演通告时间窗口缩短',
        resolutionStatus: 'UNCHANGED',
        reason: '热线机制仍需双方确认，短期内军演计划不会完全撤回。',
        expectedImpact: {
          globalTension: -1,
        },
      },
    ],
    nextRoundRisks: [
      {
        title: '网络攻击归因争议',
        type: 'CYBER',
        severity: 'MEDIUM',
        description: '若调查结果被质疑，相关联盟可能互相指责并扩大网络防御行动。',
        involvedAlliances: ['middle_east', 'north_west', 'china'],
      },
    ],
  };
}

function createRoundSettlementFallback(input: RoundSettlementInput): RoundSettlementOutput {
  const current = input.worldState;

  return {
    round: input.round,
    settlementTitle: '多边协调取得有限进展',
    summary: '理事会推动了联合调查和初步透明机制，部分风险被压低，但核心分歧仍留到下一回合。',
    metricChanges: {
      globalTension: -5,
      worldStability: 4,
      economicPressure: -2,
      humanitarianCrisis: -2,
      peaceAgreement: 2,
    },
    newWorldState: {
      globalTension: Math.max(0, current.globalTension - 5),
      worldStability: Math.min(100, current.worldStability + 4),
      aiRisk: current.aiRisk,
      economicPressure: Math.max(0, current.economicPressure - 2),
      humanitarianCrisis: Math.max(0, current.humanitarianCrisis - 2),
      peaceAgreement: Math.min(100, current.peaceAgreement + 2),
    },
    eventResults: [
      {
        eventTitle: input.events[0]?.title ?? '本回合主要危机',
        resolutionStatus: 'PARTIALLY_RESOLVED',
        resultText: '危机被部分缓和，但仍有后续谈判成本。',
        metricChanges: {
          globalTension: -5,
          worldStability: 3,
        },
      },
    ],
    allianceChanges: [
      {
        alliance: 'middle_east',
        satisfactionDelta: 4,
        newSatisfaction: 65,
        newStance: '合作',
        currentDemand: '能源走廊中立担保',
        pressureTags: ['能源安全', '调查透明'],
        lastReaction: '有条件支持理事会协调方案。',
      },
    ],
    nextRoundWarnings: ['网络攻击归因争议仍可能引发新的外交压力。'],
    rating: 68,
    ratingText: '有限缓和',
    gameStatus: 'ACTIVE',
  };
}

export async function generateEventsWithAI(input: GenerateEventsInput): Promise<GenerateEventsOutput> {
  return runStructuredAI({
    taskName: 'GENERATE_EVENTS',
    prompt: buildGenerateEventsPrompt(input),
    temperature: 0.7,
    schema: GenerateEventsOutputSchema,
    fallback: createGenerateEventsFallback(),
  });
}

export async function evaluateProposalWithAI(input: EvaluateProposalInput): Promise<EvaluateProposalOutput> {
  return runStructuredAI({
    taskName: 'EVALUATE_PROPOSAL',
    prompt: buildEvaluateProposalPrompt(input),
    temperature: 0.2,
    schema: EvaluateProposalOutputSchema,
    fallback: createEvaluateProposalFallback(),
  });
}

export async function settleRoundWithAI(input: RoundSettlementInput): Promise<RoundSettlementOutput> {
  return runStructuredAI({
    taskName: 'SETTLE_ROUND',
    prompt: buildRoundSettlementPrompt(input),
    temperature: 0.2,
    schema: RoundSettlementOutputSchema,
    fallback: createRoundSettlementFallback(input),
  });
}
