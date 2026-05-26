import {
  EvaluateProposalOutputSchema,
  GenerateEventsOutputSchema,
  type AiSource,
} from './aiSchemas.ts';
import {
  buildEvaluateProposalPrompt,
  buildGenerateEventsPrompt,
  WORLD_PEACE_COUNCIL_SYSTEM_PROMPT,
} from './aiPrompts.ts';

type GenerateEventsInput = Parameters<typeof buildGenerateEventsPrompt>[0];
type EvaluateProposalInput = Parameters<typeof buildEvaluateProposalPrompt>[0];

type GenerateEventsOutput = ReturnType<typeof GenerateEventsOutputSchema.parse>;
type EvaluateProposalOutput = ReturnType<typeof EvaluateProposalOutputSchema.parse>;

type WithAiSource = { aiSource: AiSource };

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

type StructuredAIRequest<TOutput extends WithAiSource> = {
  taskName: string;
  prompt: string;
  temperature: number;
  schema: SafeParseSchema<TOutput>;
  fallback: Omit<TOutput, 'aiSource'>;
};

const RETRY_INSTRUCTION = [
  '上一次输出无法通过 JSON schema 校验。',
  '请重新输出严格 JSON。',
  '不得输出 markdown、代码块、解释、注释或额外文本。',
  '字段名、枚举值、数字范围必须完全符合要求。',
].join('\n');

const DEFAULT_AI_REQUEST_TIMEOUT_MS = 45000;

function getEnv(name: string): string | undefined {
  const value = Deno.env.get(name)?.trim();
  return value ? value : undefined;
}

function isMockMode(): boolean {
  return getEnv('AI_MOCK_MODE')?.toLowerCase() === 'true';
}

function getRequiredEnv(name: string): string {
  const value = getEnv(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getAIRequestTimeoutMs(): number {
  const raw = getEnv('AI_REQUEST_TIMEOUT_MS');

  if (!raw) {
    return DEFAULT_AI_REQUEST_TIMEOUT_MS;
  }

  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 3000 && value <= 60000
    ? value
    : DEFAULT_AI_REQUEST_TIMEOUT_MS;
}

function getAIReasoningEffort(): string | undefined {
  const value = getEnv('AI_REASONING_EFFORT')?.toLowerCase();
  return ['low', 'medium', 'high', 'xhigh'].includes(value ?? '') ? value : undefined;
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

type RawAIResponse = {
  parsed: unknown;
  rawString: string;
  model: string;
};

async function requestOpenAICompatibleJson(prompt: string, temperature: number): Promise<RawAIResponse> {
  const baseUrl = getRequiredEnv('AI_BASE_URL').replace(/\/+$/, '');
  const apiKey = getRequiredEnv('AI_API_KEY');
  const model = getRequiredEnv('AI_MODEL');
  const reasoningEffort = getAIReasoningEffort();
  const controller = new AbortController();
  const timeoutMs = getAIRequestTimeoutMs();
  let timeout: number | undefined;

  let response: Response;
  try {
    const fetchPromise = fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature,
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
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
      signal: controller.signal,
    });
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error(`AI_REQUEST_TIMEOUT_${timeoutMs}MS`));
      }, timeoutMs);
    });

    response = await Promise.race([fetchPromise, timeoutPromise]);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`AI_REQUEST_TIMEOUT_${timeoutMs}MS`);
    }
    throw err;
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }

  if (!response.ok) {
    throw new Error(`AI request failed with status ${response.status}.`);
  }

  const responseJson: unknown = await response.json();
  const content = getAssistantContent(responseJson);
  const reportedModel = isRecord(responseJson) && typeof responseJson.model === 'string' && responseJson.model
    ? responseJson.model
    : 'unknown';

  return { parsed: parseAIJson(content), rawString: content, model: reportedModel };
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

type StructuredAIResult<TOutput extends WithAiSource> = {
  output: TOutput;
  rawString: string | null;
  model: string;
  durationMs: number;
};

async function runStructuredAI<TOutput extends WithAiSource>({
  taskName,
  prompt,
  temperature,
  schema,
  fallback,
}: StructuredAIRequest<TOutput>): Promise<StructuredAIResult<TOutput>> {
  const startMs = Date.now();

  if (isMockMode()) {
    console.warn(`[MOCK] ${taskName} -- AI_MOCK_MODE=true,使用 fallback 输出`);
    const validated = validateAIOutput(
      schema,
      { ...fallback, aiSource: 'mock' satisfies AiSource },
      `${taskName}_MOCK`,
    );
    const durationMs = Date.now() - startMs;
    console.log(JSON.stringify({ task: taskName, durationMs, aiSource: 'mock' }));
    return { output: validated, rawString: null, model: 'mock', durationMs };
  }

  const prompts = [prompt, `${prompt}\n\n${RETRY_INSTRUCTION}`];

  for (const currentPrompt of prompts) {
    try {
      const result = await requestOpenAICompatibleJson(currentPrompt, temperature);
      const enrichedOutput = isRecord(result.parsed)
        ? { ...result.parsed, aiSource: 'live' satisfies AiSource }
        : result.parsed;
      const validated = validateAIOutput(schema, enrichedOutput, taskName);
      const durationMs = Date.now() - startMs;
      console.log(JSON.stringify({ task: taskName, durationMs, aiSource: 'live' }));
      return { output: validated, rawString: result.rawString ?? null, model: result.model, durationMs };
    } catch (error) {
      console.error(`${taskName}_ATTEMPT_FAILED`, error);
      if (error instanceof Error && error.message.startsWith('AI_REQUEST_TIMEOUT_')) {
        break;
      }
    }
  }

  console.error(`${taskName}_FALLBACK_USED`);
  const validated = validateAIOutput(
    schema,
    { ...fallback, aiSource: 'fallback' satisfies AiSource },
    `${taskName}_FALLBACK`,
  );
  const durationMs = Date.now() - startMs;
  console.log(JSON.stringify({ task: taskName, durationMs, aiSource: 'fallback' }));
  return { output: validated, rawString: null, model: 'fallback', durationMs };
}

// ----------------------------------------------------------------------------
// Fallback 文案模板池
// ----------------------------------------------------------------------------
// 真实 AI 调用失败两次后兜底走这里。多套模板保证：
//   1. 并发 fallback 时多个游戏不会出现完全雷同的事件/裁定文本（可读性差）；
//   2. 玩家偶尔遇到 fallback 也仍有不同的剧情节奏；
//   3. 每套都覆盖差异化的事件类型组合，避免 fallback 总是"能源/军事/粮食"三件套。
//
// 添加新模板时务必通过 GenerateEventsOutputSchema / EvaluateProposalOutputSchema
// 的字段约束检查（数值上下限、enum 值、字数等）。

type GenerateEventsFallbackOutput = Omit<GenerateEventsOutput, 'aiSource'>;

const GENERATE_EVENTS_FALLBACK_TEMPLATES: GenerateEventsFallbackOutput[] = [
  {
    events: [
      {
        title: '能源走廊调度系统遭受网络干扰',
        type: 'ENERGY',
        severity: 'HIGH',
        description: '中东能源走廊的港口调度系统出现异常，多国担心运输延迟会推高能源价格。',
        involvedAlliances: ['middle_east', 'north_west', 'china'],
        potentialImpact: { globalTension: 7, worldStability: -4, economicPressure: 5 },
        recommendedActions: ['联合技术调查', '能源通道中立担保', '临时市场稳定协调'],
        unresolvedConsequence: '若攻击来源继续不明，护航和报复性网络行动可能升级。',
      },
      {
        title: '边境军演通告时间窗口缩短',
        type: 'MILITARY',
        severity: 'MEDIUM',
        description: '俄罗斯联邦与北美·西方联盟附近的军演通告窗口缩短，误判风险上升。',
        involvedAlliances: ['russia', 'north_west'],
        potentialImpact: { globalTension: 6, worldStability: -3 },
        recommendedActions: ['恢复热线通报', '交换观察员名单', '限制演训区域'],
        unresolvedConsequence: '若缺少透明机制，下一回合可能出现空域或海域擦枪走火。',
      },
      {
        title: '粮食期货价格连续跳涨',
        type: 'FOOD',
        severity: 'MEDIUM',
        description: '主要粮食品类期货价格连续上涨，非洲与拉美国家要求建立缓冲基金。',
        involvedAlliances: ['africa', 'latin_america', 'southeast_asia'],
        potentialImpact: { economicPressure: 6, humanitarianCrisis: 4, worldStability: -2 },
        recommendedActions: ['粮食价格缓冲基金', '出口协调机制', '人道援助快速通道'],
        unresolvedConsequence: '若价格继续上涨，社会稳定和难民压力会在后续回合累积。',
      },
    ],
    roundBriefing: '本回合风险集中在能源、军演误判与粮食价格三条线，任何单一提案都难以同时解决全部压力。',
    priorityIssue: '能源走廊安全与军事误判控制',
  },
  {
    events: [
      {
        title: '跨境数据中心遭勒索软件攻击',
        type: 'CYBER',
        severity: 'HIGH',
        description: '关键金融与政务系统遭加密勒索，多国担心溢出影响支付与公共服务。',
        involvedAlliances: ['north_west', 'china', 'southeast_asia'],
        potentialImpact: { globalTension: 5, aiRisk: 4, economicPressure: 3 },
        recommendedActions: ['联合溯源调查', '应急互助通报机制'],
        unresolvedConsequence: '若责任不清，相关国家可能采取报复性网络行动。',
      },
      {
        title: '通用 AI 模型权重外泄争议',
        type: 'AI',
        severity: 'MEDIUM',
        description: '一份高能力模型权重据称在第三方平台流出，扩散管控成为焦点。',
        involvedAlliances: ['china', 'north_west'],
        potentialImpact: { aiRisk: 6, peaceAgreement: -2 },
        recommendedActions: ['推动算法透明审查', '共建 AI 红线公约'],
        unresolvedConsequence: '若分歧扩大，AI 治理框架谈判可能停摆。',
      },
      {
        title: '航运联盟运价分歧加剧',
        type: 'SUPPLY_CHAIN',
        severity: 'MEDIUM',
        description: '主要航运公司运价标准出现分裂，东南亚与欧洲港口拥堵。',
        involvedAlliances: ['southeast_asia', 'north_west'],
        potentialImpact: { economicPressure: 5, worldStability: -2 },
        recommendedActions: ['多边运价缓冲', '关键航道优先调度'],
        unresolvedConsequence: '若僵持，二级供应链停摆压力将传导至民生消费。',
      },
    ],
    roundBriefing: '网络与 AI 风险并行抬升，叠加航运分歧，本回合需要技术治理与经济缓冲并举。',
    priorityIssue: '网络安全溯源与 AI 治理透明度',
  },
  {
    events: [
      {
        title: '萨赫勒地区气候难民数量激增',
        type: 'REFUGEE',
        severity: 'HIGH',
        description: '极端干旱叠加冲突导致跨境流离失所人口大幅增长，邻国接收能力告急。',
        involvedAlliances: ['africa', 'middle_east'],
        potentialImpact: { humanitarianCrisis: 7, worldStability: -3 },
        recommendedActions: ['人道走廊紧急建立', '多边援助资金池'],
        unresolvedConsequence: '若援助迟到，地区不稳定可能引发更大规模冲突。',
      },
      {
        title: '拉美主粮主产区旱情加剧',
        type: 'FOOD',
        severity: 'MEDIUM',
        description: '巴西与阿根廷主粮带连续少雨，全球粮食出口配额面临压力。',
        involvedAlliances: ['latin_america', 'africa'],
        potentialImpact: { economicPressure: 4, humanitarianCrisis: 3 },
        recommendedActions: ['国际粮食价格协调', '储备粮临时释放'],
        unresolvedConsequence: '若情况延续，下一回合非洲与中东民生压力将进一步放大。',
      },
      {
        title: '新型清洁能源标准对接窗口',
        type: 'DIPLOMACY',
        severity: 'OPPORTUNITY',
        description: '多边能源转型机构发起新一轮标准对话，多个联盟表达参与意向。',
        involvedAlliances: ['china', 'north_west', 'africa'],
        potentialImpact: { peaceAgreement: 3, worldStability: 2 },
        recommendedActions: ['推动技术标准互认', '设立联合示范项目'],
        unresolvedConsequence: '若错过机会窗口，下一阶段标准可能各自为政。',
      },
    ],
    roundBriefing: '人道压力与气候连锁反应叠加，但能源标准对接带来一次合作窗口，回合关键在于平衡救济与机制建设。',
    priorityIssue: '人道援助通道与能源标准联合',
  },
  {
    events: [
      {
        title: '近海无人系统对峙升级',
        type: 'MILITARY',
        severity: 'HIGH',
        description: '争议海域出现多艘无人水面艇近距离对峙，规则空白带来误判风险。',
        involvedAlliances: ['china', 'north_west', 'southeast_asia'],
        potentialImpact: { globalTension: 8, worldStability: -4 },
        recommendedActions: ['制定无人系统行为规范', '建立海上意外相遇规则'],
        unresolvedConsequence: '若没有共识，下一回合可能出现真实碰撞或开火事件。',
      },
      {
        title: '关键矿产出口许可争议',
        type: 'ECONOMY',
        severity: 'MEDIUM',
        description: '多国就关键矿产出口审批门槛展开博弈，下游产业链担忧加剧。',
        involvedAlliances: ['latin_america', 'africa', 'china'],
        potentialImpact: { economicPressure: 5, worldStability: -2 },
        recommendedActions: ['资源多元化谈判', '价格透明披露机制'],
        unresolvedConsequence: '若僵持，半导体与新能源行业将面临断链风险。',
      },
      {
        title: '跨太平洋海底光缆维护协调',
        type: 'DIPLOMACY',
        severity: 'OPPORTUNITY',
        description: '多国就海底光缆维护与故障应急通报达成原则性共识。',
        involvedAlliances: ['southeast_asia', 'north_west', 'china'],
        potentialImpact: { peaceAgreement: 2, worldStability: 2 },
        recommendedActions: ['共建维护通报机制', '设立故障应急快速通道'],
        unresolvedConsequence: '若机制落地拖延，关键通信基础设施风险将累积。',
      },
    ],
    roundBriefing: '军事与经济战线同时承压，但通信基础设施合作窗口带来缓和契机。',
    priorityIssue: '无人系统行为规范与关键矿产协商',
  },
];

type EvaluateProposalFallbackVariant = {
  mainGoal: string;
  reactionText: string;
  reason: string;
  summary: string;
  strengths: [string, string];
  weaknesses: [string, string];
  forecastReasonPrimary: string;
  forecastReasonSecondary: string;
  riskTitle: string;
  riskDescription: string;
};

const EVALUATE_PROPOSAL_FALLBACK_VARIANTS: EvaluateProposalFallbackVariant[] = [
  {
    mainGoal: '通过有限谈判和透明机制降低本回合危机外溢风险。',
    reactionText: '原则上愿意谈判，但需要对等承诺和可核验安排。',
    reason: '提案有助于降温，但执行约束仍不充分。',
    summary: '提案能降低短期误判风险，但仍需要后续核验和执行安排。',
    strengths: ['目标集中', '有助于恢复沟通'],
    weaknesses: ['约束机制不足', '执行细节不清'],
    forecastReasonPrimary: '谈判和热线机制能降低误判，但无法立即消除根本分歧。',
    forecastReasonSecondary: '相关安排需要更多联盟确认，短期只能部分缓和。',
    riskTitle: '执行核验争议',
    riskDescription: '若谈判承诺缺少核验机制，相关联盟可能重新质疑对方诚意。',
  },
  {
    mainGoal: '推动多边对话与阶段性互信建设，先稳定再深入。',
    reactionText: '愿意启动磋商，但要求设立明确时间表与里程碑。',
    reason: '方向务实，但缺乏对核心利益的对等回应。',
    summary: '提案搭建了对话框架，短期内可降温，长期效力依赖后续机制落地。',
    strengths: ['框架务实', '减少误判通道'],
    weaknesses: ['利益对等模糊', '缺少时间表'],
    forecastReasonPrimary: '对话渠道恢复能减小擦枪走火概率，但分歧本体不变。',
    forecastReasonSecondary: '部分联盟仍持观望态度，短期效果有限。',
    riskTitle: '互信节奏争议',
    riskDescription: '若没有阶段性可核验里程碑，互信建设容易反复。',
  },
  {
    mainGoal: '聚焦点状危机降温，回避结构性议题留待下一阶段。',
    reactionText: '可以接受过渡性安排，但保留对核心议题的最终表态。',
    reason: '提案先治标，给后续谈判留出窗口。',
    summary: '提案在短期内有缓和效果，但未触及根本结构性矛盾。',
    strengths: ['短期可执行', '风险敞口收窄'],
    weaknesses: ['未触及根本', '后续接续不清晰'],
    forecastReasonPrimary: '过渡安排能延缓升级，但矛盾本身延续到下一阶段。',
    forecastReasonSecondary: '相关联盟反应分化，整体降温但局部仍紧。',
    riskTitle: '结构性议题悬置',
    riskDescription: '若结构性矛盾持续被推迟，下一回合可能以更激烈形式出现。',
  },
  {
    mainGoal: '通过机制化合作建立长期协调通道，弱化对抗惯性。',
    reactionText: '认可机制化方向，但要求权利义务对等并有可退出条款。',
    reason: '提案具备机制深度，但实施门槛和触发条件需要进一步谈判。',
    summary: '提案在治理深度上更进一步，短期成本较高但长期收益明显。',
    strengths: ['机制化深度', '降低对抗惯性'],
    weaknesses: ['启动成本偏高', '退出机制不明'],
    forecastReasonPrimary: '机制启动后可显著降低误判，但首期投入会拉高短期摩擦。',
    forecastReasonSecondary: '部分联盟担心被绑入长期承诺，需要更多保证条款。',
    riskTitle: '启动成本与退出条款',
    riskDescription: '若启动成本与退出机制设计不平衡，机制可能开局即停摆。',
  },
];

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function createGenerateEventsFallback(): GenerateEventsFallbackOutput {
  return pickRandom(GENERATE_EVENTS_FALLBACK_TEMPLATES);
}

function createEvaluateProposalFallback(input: EvaluateProposalInput): Omit<EvaluateProposalOutput, 'aiSource'> {
  const involvedAlliances = [
    ...input.proposal.mentionedAlliances,
    ...input.events.flatMap((event) => event.involvedAlliances),
  ];
  const uniqueAlliances = [...new Set(involvedAlliances)].slice(0, 5);
  const fallbackAlliances = uniqueAlliances.length
    ? uniqueAlliances
    : [input.alliances[0]?.allianceId ?? 'north_west'];
  const targetEvents = input.events.slice(0, 2);
  const variant = pickRandom(EVALUATE_PROPOSAL_FALLBACK_VARIANTS);

  return {
    proposalUnderstanding: {
      mainGoal: variant.mainGoal,
      mentionedAlliances: fallbackAlliances,
      actionTypes: input.proposal.actionTypes.length ? input.proposal.actionTypes : ['谈判'],
      targetEvents: targetEvents.map((event) => event.title),
    },
    allianceReactions: fallbackAlliances.map((alliance, index) => ({
        alliance,
        attitude: 'ACCEPT_CONDITIONALLY',
        reactionText: variant.reactionText,
        reason: variant.reason,
        satisfactionDelta: index === 0 ? 3 : 1,
      })),
    aiAssessment: {
      successProbability: 58,
      summary: variant.summary,
      strengths: [...variant.strengths],
      weaknesses: [...variant.weaknesses],
      expectedImpact: {
        globalTension: -3,
        worldStability: 2,
        peaceAgreement: 1,
      },
      feasibility: 0.5,
      escalationRisk: 0.4,
      confidence: 0.6,
    },
    eventResolutionForecast: targetEvents.map((event, index) => ({
        eventId: event.id,
        resolutionStatus: 'PARTIALLY_RESOLVED',
        reason: index === 0 ? variant.forecastReasonPrimary : variant.forecastReasonSecondary,
        expectedImpact: {
          globalTension: -1,
        },
      })),
    nextRoundRisks: [
      {
        title: variant.riskTitle,
        type: targetEvents[0]?.type ?? 'DIPLOMACY',
        severity: 'MEDIUM',
        description: variant.riskDescription,
        involvedAlliances: fallbackAlliances.slice(0, 3),
      },
    ],
  };
}

export async function generateEventsWithAI(
  input: GenerateEventsInput,
): Promise<StructuredAIResult<GenerateEventsOutput>> {
  return runStructuredAI({
    taskName: 'GENERATE_EVENTS',
    prompt: buildGenerateEventsPrompt(input),
    temperature: 0.7,
    schema: GenerateEventsOutputSchema,
    fallback: createGenerateEventsFallback(),
  });
}

export async function evaluateProposalWithAI(
  input: EvaluateProposalInput,
): Promise<StructuredAIResult<EvaluateProposalOutput>> {
  return runStructuredAI({
    taskName: 'EVALUATE_PROPOSAL',
    prompt: buildEvaluateProposalPrompt(input),
    temperature: 0.2,
    schema: EvaluateProposalOutputSchema,
    fallback: createEvaluateProposalFallback(input),
  });
}
