import { callAIProvider } from '@/lib/ai-provider'
import { checkRateLimit } from '@/lib/rate-limit'
import { readFileSync } from 'fs'
import { join } from 'path'

function getProviderConfig(hasImages: boolean) {
  // Images present → use vision model, text only → use text model
  const prefix = hasImages ? 'AI_VISION_' : 'AI_'
  const fallback = hasImages
    ? {
        name: process.env.AI_VISION_FALLBACK_PROVIDER,
        baseURL: process.env.AI_VISION_FALLBACK_BASE_URL,
        apiKey: process.env.AI_VISION_FALLBACK_API_KEY,
        model: process.env.AI_VISION_FALLBACK_MODEL,
      }
    : {
        name: process.env.AI_FALLBACK_PROVIDER,
        baseURL: process.env.AI_FALLBACK_BASE_URL,
        apiKey: process.env.AI_FALLBACK_API_KEY,
        model: process.env.AI_FALLBACK_MODEL,
      }

  return {
    primary: {
      name: process.env[prefix + 'PROVIDER'] || 'deepseek',
      baseURL: process.env[prefix + 'BASE_URL'] || 'https://api.deepseek.com/v1',
      apiKey: process.env[prefix + 'API_KEY'] || '',
      model: process.env[prefix + 'MODEL'] || 'deepseek-chat',
    },
    fallback: fallback.baseURL ? fallback : undefined,
  }
}

function loadSystemPrompt(): string {
  try {
    const promptPath = join(process.cwd(), 'prompts', 'test-case-generator.md')
    return readFileSync(promptPath, 'utf-8')
  } catch {
    return `你是资深 QA 测试专家。根据用户输入的需求描述，生成完整的结构化测试用例。
每个用例必须包含：编号、标题、前置条件、步骤（数组）、预期结果、优先级（P0-P3）、类型（功能/边界值/异常/兼容性/性能）。
必须覆盖正向功能、边界值、异常场景各至少 1 条。
如果需求中存在模糊或自相矛盾的地方，在 fuzzyPoints 字段中标注。`
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: { text?: string; images?: string[] }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: '请求格式错误，请提供 JSON 格式的请求体' }, { status: 400 })
  }

  const { text, images = [] } = body

  if (!text || !text.trim()) {
    return Response.json({ error: '请输入需求描述' }, { status: 400 })
  }

  if (text.length > 10000) {
    return Response.json({ error: '需求描述过长，请限制在 10000 字以内' }, { status: 400 })
  }

  if (images.length > 3) {
    return Response.json({ error: '最多支持 3 张图片' }, { status: 400 })
  }

  // Rate limit (fail-open)
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    const { allowed } = await checkRateLimit(ip)
    if (!allowed) {
      return Response.json({ error: '请求过于频繁，请稍后再试' }, { status: 429 })
    }
  } catch {
    // Rate limiter down → allow
  }

  const hasImages = images.length > 0
  const providerConfig = getProviderConfig(hasImages)
  const systemPrompt = loadSystemPrompt()

  const result = await callAIProvider({
    primary: providerConfig.primary,
    fallback: providerConfig.fallback,
    systemPrompt,
    userText: text.trim(),
    images,
  })

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 500 })
  }

  return Response.json({
    title: result.data.title,
    summary: result.data.summary,
    testCases: result.data.testCases,
    fuzzyPoints: result.data.fuzzyPoints,
    metadata: result.metadata,
  })
}
