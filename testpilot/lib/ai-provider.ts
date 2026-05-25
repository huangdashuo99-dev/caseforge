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

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await callOnce(config, systemPrompt, userText, images)
      tokens = result.tokens

      if (!result.content || !result.content.trim()) {
        lastError = 'AI 返回内容为空'
        continue
      }

      const parsed = parseTestCases(result.content)
      if (!parsed.success) {
        lastError = parsed.error
        continue
      }

      return { success: true, data: parsed.data, tokens }
    } catch (e) {
      lastError = e instanceof Error ? e.message : '未知错误'
      if (!isTimeoutError(e)) {
        break // Don't retry non-timeout errors
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
  }

  return {
    success: false,
    error: `AI 服务暂时不可用，请稍后重试。`,
    metadata: {
      provider: primary.name,
      model: primary.model,
      durationMs: Date.now() - startTime,
      tokens: 0,
    },
  }
}
