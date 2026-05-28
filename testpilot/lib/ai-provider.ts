import OpenAI from 'openai'
import { parseTestCases, type TestCaseResult } from './json-parser'

export interface ProviderConfig {
  name: string
  baseURL: string
  apiKey: string
  model: string
}

interface CallAIProviderInput {
  primary: ProviderConfig
  fallback?: ProviderConfig
  systemPrompt: string
  userText: string
  images: string[]
}

interface AIMetadata {
  provider: string
  model: string
  durationMs: number
  tokens: number
}

export interface AIResultSuccess {
  success: true
  data: TestCaseResult
  metadata: AIMetadata
}

export interface AIResultError {
  success: false
  error: string
  metadata: AIMetadata
}

export type AIResult = AIResultSuccess | AIResultError

const PRIORITY_TARGETS: Record<string, number> = { P0: 0.05, P1: 0.15, P2: 0.30, P3: 0.45, P4: 0.05 }
const PRIORITY_TOLERANCE = 0.03

function validatePriorityDistribution(testCases: { priority: string }[]): {
  valid: boolean
  message: string
  counts: Record<string, number>
  expected: Record<string, number>
} {
  const n = testCases.length
  if (n < 5) return { valid: true, message: '', counts: {}, expected: {} }

  const counts: Record<string, number> = { P0: 0, P1: 0, P2: 0, P3: 0, P4: 0 }
  for (const tc of testCases) {
    if (counts[tc.priority] !== undefined) counts[tc.priority]++
  }

  const issues: string[] = []
  for (const [p, target] of Object.entries(PRIORITY_TARGETS)) {
    const actual = counts[p] / n
    const lower = p === 'P4' ? 0 : target - PRIORITY_TOLERANCE
    const upper = target + PRIORITY_TOLERANCE
    if (actual < lower) {
      issues.push(`${p}实际${counts[p]}条(${Math.round(actual * 100)}%)，目标${Math.round(target * 100)}%，偏少`)
    } else if (actual > upper) {
      issues.push(`${p}实际${counts[p]}条(${Math.round(actual * 100)}%)，目标${Math.round(target * 100)}%，偏多`)
    }
  }

  if (issues.length === 0) return { valid: true, message: '', counts, expected: {} }

  const expected: Record<string, number> = {}
  for (const p of ['P0', 'P1', 'P2', 'P3', 'P4']) {
    expected[p] = Math.max(p === 'P0' ? 1 : 0, Math.round(PRIORITY_TARGETS[p] * n))
  }

  return { valid: false, message: issues.join('；'), counts, expected }
}

function isTimeoutError(e: unknown): boolean {
  return e instanceof Error && (e.message.includes('timeout') || e.message.includes('timed out') || e.name === 'AbortError')
}

async function callOnce(
  config: ProviderConfig,
  systemPrompt: string,
  userText: string,
  images: string[],
): Promise<{ content: string | null; tokens: number }> {
  const client = new OpenAI({ baseURL: config.baseURL, apiKey: config.apiKey })

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ]

  if (images.length > 0) {
    const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: 'text', text: userText }]
    for (const img of images) {
      parts.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${img}` } })
    }
    messages.push({ role: 'user', content: parts })
  } else {
    messages.push({ role: 'user', content: userText })
  }

  const response = await client.chat.completions.create({
    model: config.model,
    messages,
    temperature: 0.3,
    max_tokens: 16384,
  })

  return {
    content: response.choices[0]?.message?.content ?? null,
    tokens: response.usage?.total_tokens ?? 0,
  }
}

async function tryProvider(
  config: ProviderConfig,
  systemPrompt: string,
  userText: string,
  images: string[],
): Promise<{ success: true; data: TestCaseResult; tokens: number } | { success: false; error: string; tokens: number }> {
  let lastError = ''
  let tokens = 0
  let promptText = userText

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await callOnce(config, systemPrompt, promptText, images)
      tokens = result.tokens

      if (!result.content || !result.content.trim()) {
        lastError = '返回内容为空'
        continue
      }

      const parsed = parseTestCases(result.content)
      if (!parsed.success) {
        lastError = parsed.error
        continue
      }

      const distCheck = validatePriorityDistribution(parsed.data.testCases)
      if (!distCheck.valid && attempt === 0) {
        const exp = distCheck.expected
        promptText = userText + '\n\n[重要系统指令] 上一版优先级分布不达标：' + distCheck.message +
          '。本次必须调整优先级分布为：P0=' + exp.P0 + '条、P1=' + exp.P1 + '条、P2=' + exp.P2 + '条、P3=' + exp.P3 + '条、P4=' + exp.P4 + '条。用例内容和数量保持，仅调整优先级字段。'
        lastError = '优先级分布: ' + distCheck.message
        continue
      }

      if (!distCheck.valid) {
        console.warn('[TestPilot] Priority divergence accepted: ' + distCheck.message + '. Counts: ' + JSON.stringify(distCheck.counts))
      }

      return { success: true, data: parsed.data, tokens }
    } catch (e) {
      lastError = e instanceof Error ? e.message : '未知错误'
      if (!isTimeoutError(e)) {
        break
      }
    }
  }

  return { success: false, error: lastError || '未知错误', tokens }
}

export async function callAIProvider(input: CallAIProviderInput): Promise<AIResult> {
  const { primary, fallback, systemPrompt, userText, images = [] } = input
  const startTime = Date.now()

  // Try primary
  const primaryResult = await tryProvider(primary, systemPrompt, userText, images)

  if (primaryResult.success) {
    return {
      success: true,
      data: primaryResult.data,
      metadata: {
        provider: primary.name,
        model: primary.model,
        durationMs: Date.now() - startTime,
        tokens: primaryResult.tokens,
      },
    }
  }

  // Try fallback
  if (fallback) {
    const fallbackResult = await tryProvider(fallback, systemPrompt, userText, images)

    if (fallbackResult.success) {
      return {
        success: true,
        data: fallbackResult.data,
        metadata: {
          provider: fallback.name,
          model: fallback.model,
          durationMs: Date.now() - startTime,
          tokens: fallbackResult.tokens,
        },
      }
    }

    return {
      success: false,
      error: `服务暂时不可用，请稍后重试。错误详情: ${primaryResult.error}`,
      metadata: {
        provider: primary.name,
        model: primary.model,
        durationMs: Date.now() - startTime,
        tokens: 0,
      },
    }
  }

  return {
    success: false,
    error: `服务暂时不可用，请稍后重试。错误详情: ${primaryResult.error}`,
    metadata: {
      provider: primary.name,
      model: primary.model,
      durationMs: Date.now() - startTime,
      tokens: 0,
    },
  }
}
