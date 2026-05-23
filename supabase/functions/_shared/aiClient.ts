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

function createGenerateEventsFallback(): Omit<GenerateEventsOutput, 'aiSource'> {
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

  return {
    proposalUnderstanding: {
      mainGoal: '通过有限谈判和透明机制降低本回合危机外溢风险。',
      mentionedAlliances: fallbackAlliances,
      actionTypes: input.proposal.actionTypes.length ? input.proposal.actionTypes : ['谈判'],
      targetEvents: targetEvents.map((event) => event.title),
    },
    allianceReactions: fallbackAlliances.map((alliance, index) => ({
        alliance,
        attitude: 'ACCEPT_CONDITIONALLY',
        reactionText: '原则上愿意谈判，但需要对等承诺和可核验安排。',
        reason: '提案有助于降温，但执行约束仍不充分。',
        satisfactionDelta: index === 0 ? 3 : 1,
      })),
    aiAssessment: {
      successProbability: 58,
      summary: '提案能降低短期误判风险，但仍需要后续核验和执行安排。',
      strengths: ['目标集中', '有助于恢复沟通'],
      weaknesses: ['约束机制不足', '执行细节不清'],
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
        reason: index === 0
          ? '谈判和热线机制能降低误判，但无法立即消除根本分歧。'
          : '相关安排需要更多联盟确认，短期只能部分缓和。',
        expectedImpact: {
          globalTension: -1,
        },
      })),
    nextRoundRisks: [
      {
        title: '执行核验争议',
        type: targetEvents[0]?.type ?? 'DIPLOMACY',
        severity: 'MEDIUM',
        description: '若谈判承诺缺少核验机制，相关联盟可能重新质疑对方诚意。',
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
