import { callAIProvider } from '@/lib/ai-provider'
import { checkRateLimit } from '@/lib/rate-limit'
import { readFileSync } from 'fs'
import { join } from 'path'

function getProviderConfig(hasImages: boolean) {
  const prefix = hasImages ? 'AI_VISION_' : 'AI_'
  const fbPrefix = hasImages ? 'AI_VISION_FALLBACK_' : 'AI_FALLBACK_'
  const fbBaseURL = process.env[fbPrefix + 'BASE_URL']

  return {
    primary: {
      name: process.env[prefix + 'PROVIDER'] || 'deepseek',
      baseURL: process.env[prefix + 'BASE_URL'] || 'https://api.deepseek.com/v1',
      apiKey: process.env[prefix + 'API_KEY'] || '',
      model: process.env[prefix + 'MODEL'] || 'deepseek-chat',
    },
    fallback: fbBaseURL
      ? {
          name: process.env[fbPrefix + 'PROVIDER'] || '',
          baseURL: fbBaseURL,
          apiKey: process.env[fbPrefix + 'API_KEY'] || '',
          model: process.env[fbPrefix + 'MODEL'] || '',
        }
      : undefined,
  }
}

// Load system prompts from files
const SYSTEM_PROMPT_ZH = readFileSync(join(process.cwd(), 'prompts', 'test-case-generator.zh.md'), 'utf-8')
const SYSTEM_PROMPT_EN = readFileSync(join(process.cwd(), 'prompts', 'test-case-generator.en.md'), 'utf-8')

// Locale-aware error messages
const ERROR_MESSAGES: Record<string, Record<string, string>> = {
  zh: {
    invalidBody: '请求格式错误，请提供 JSON 格式的请求体',
    emptyText: '请输入需求描述',
    tooShort: '需求描述过短（少于 10 个字），请提供更具体的功能描述',
    tooLong: '需求描述过长，请限制在 10000 字以内',
    tooManyImages: '最多支持 3 张图片',
    rateLimited: '请求过于频繁，请稍后再试',
  },
  en: {
    invalidBody: 'Invalid request format, please provide a JSON request body',
    emptyText: 'Please enter a requirements description',
    tooShort: 'Requirements description is too short (less than 10 characters), please provide more specific details',
    tooLong: 'Requirements description is too long, please limit to 10000 characters',
    tooManyImages: 'Maximum 3 images supported',
    rateLimited: 'Too many requests, please try again later',
  },
}

export async function POST(request: Request): Promise<Response> {
  let body: { text?: string; images?: string[]; locale?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: ERROR_MESSAGES.zh.invalidBody }, { status: 400 })
  }

  const { text, images = [], locale = 'zh' } = body
  const msgs = ERROR_MESSAGES[locale] || ERROR_MESSAGES.zh

  if (!text || !text.trim()) {
    return Response.json({ error: msgs.emptyText }, { status: 400 })
  }

  if (text.trim().length < 10) {
    return Response.json({ error: msgs.tooShort }, { status: 400 })
  }

  if (text.length > 10000) {
    return Response.json({ error: msgs.tooLong }, { status: 400 })
  }

  if (images.length > 3) {
    return Response.json({ error: msgs.tooManyImages }, { status: 400 })
  }

  // Rate limit (fail-open)
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    const { allowed } = await checkRateLimit(ip)
    if (!allowed) {
      return Response.json({ error: msgs.rateLimited }, { status: 429 })
    }
  } catch {
    // Rate limiter down → allow
  }

  const hasImages = images.length > 0
  const providerConfig = getProviderConfig(hasImages)
  const systemPrompt = locale === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_ZH
  const result = await callAIProvider({
    primary: providerConfig.primary,
    fallback: providerConfig.fallback,
    systemPrompt,
    userText: text.trim(),
    images,
    locale,
  })

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 500 })
  }

  console.log(`[TestPilot] ${locale} ${result.metadata.provider}/${result.metadata.model} · ${(result.metadata.durationMs / 1000).toFixed(1)}s · ${result.metadata.tokens} tokens`)

  return Response.json({
    title: result.data.title,
    summary: result.data.summary,
    testCases: result.data.testCases,
    fuzzyPoints: result.data.fuzzyPoints,
    metadata: result.metadata,
  })
}
