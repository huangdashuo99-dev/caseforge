export interface TestCase {
  id: string
  title: string
  precondition: string
  steps: string[]
  expected: string
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  type: string
}

export interface FuzzyPoint {
  description: string
  suggestion: string
}

export interface TestCaseResult {
  title: string
  summary: string
  testCases: TestCase[]
  fuzzyPoints: FuzzyPoint[]
}

interface ParseSuccess {
  success: true
  data: TestCaseResult
}

interface ParseError {
  success: false
  error: string
  refusal: boolean
}

export type ParseResult = ParseSuccess | ParseError

const REFUSAL_KEYWORDS_CN = ['抱歉，我无法', '无法生成', '我不能', '无法处理', '不支持']
const REFUSAL_KEYWORDS_EN = ['i cannot', 'i am unable', 'cannot generate', 'not able to']

function detectRefusal(text: string): boolean {
  const lower = text.toLowerCase()
  return REFUSAL_KEYWORDS_CN.some((k) => text.includes(k)) || REFUSAL_KEYWORDS_EN.some((k) => lower.includes(k))
}

function stripFencesAndBOM(text: string): string {
  let cleaned = text.trim()

  // Remove BOM (U+FEFF)
  if (cleaned.charCodeAt(0) === 0xfeff) {
    cleaned = cleaned.slice(1)
  }

  // Strip ```json / ``` fences
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n')
    if (firstNewline !== -1 && cleaned.endsWith('```')) {
      cleaned = cleaned.slice(firstNewline + 1, cleaned.length - 3).trim()
    }
  }

  return cleaned
}

function fixJSON(text: string): string {
  // Fix trailing commas before ] or }
  return text.replace(/,(\s*[}\]])/g, '$1')
}

function validateSchema(data: unknown): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'AI 返回格式异常（非 JSON 对象）' }
  }
  const obj = data as Record<string, unknown>
  if (typeof obj.title !== 'string' || !obj.title.trim()) {
    return { valid: false, error: 'AI 返回缺少 title 字段或为空' }
  }
  if (!Array.isArray(obj.testCases)) {
    return { valid: false, error: 'AI 返回缺少 testCases 数组' }
  }
  if (obj.testCases.length === 0) {
    return { valid: false, error: 'AI 未生成用例，请尝试提供更详细的需求描述' }
  }
  return { valid: true }
}

export function parseTestCases(raw: string): ParseResult {
  if (!raw || !raw.trim()) {
    return { success: false, error: 'AI 返回内容为空', refusal: false }
  }

  if (detectRefusal(raw)) {
    return {
      success: false,
      error: 'AI 无法处理此需求，可能包含不支持的内容。请尝试换个角度描述需求。',
      refusal: true,
    }
  }

  const cleaned = stripFencesAndBOM(raw)
  let parsed: unknown

  try {
    parsed = JSON.parse(cleaned)
  } catch {
    // Try fixing common JSON issues and re-parse
    try {
      const fixed = fixJSON(cleaned)
      parsed = JSON.parse(fixed)
    } catch {
      return { success: false, error: 'AI 返回格式异常，请重试', refusal: false }
    }
  }

  const validation = validateSchema(parsed)
  if (!validation.valid) {
    return { success: false, error: validation.error!, refusal: false }
  }

  return { success: true, data: parsed as TestCaseResult }
}
