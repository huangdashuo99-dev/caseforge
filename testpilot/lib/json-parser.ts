export interface TestCase {
  id: string
  title: string
  precondition: string
  steps: string[]
  expected: string[]
  priority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
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
const NEED_MORE_DETAIL_CN = ['请提供', '请描述', '需要更多', '请详细', '请补充', '请具体说明', '请告诉我', '请明确']
const NEED_MORE_DETAIL_EN = ['please provide', 'please describe', 'need more', 'please specify', 'could you provide', 'more detail', 'more information']

function detectRefusal(text: string): string | null {
  const lower = text.toLowerCase()
  if (REFUSAL_KEYWORDS_CN.some((k) => text.includes(k))) return 'refusal'
  if (REFUSAL_KEYWORDS_EN.some((k) => lower.includes(k))) return 'refusal'
  if (NEED_MORE_DETAIL_CN.some((k) => text.includes(k))) return 'need_more_detail'
  if (NEED_MORE_DETAIL_EN.some((k) => lower.includes(k))) return 'need_more_detail'
  return null
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

function stripTypeLabels(title: string): string {
  // Remove type labels like 【正向】, [异常], (边界值) from title
  // These belong in the type field, not the title
  return title
    .replace(/[【\[\(（]正向(?:功能|场景)?[】\]\)）]\s*/g, '')
    .replace(/[【\[\(（]边界(?:值|场景)?[】\]\)）]\s*/g, '')
    .replace(/[【\[\(（]异常(?:场景|情况)?[】\]\)）]\s*/g, '')
    .replace(/[【\[\(（]兼容性[】\]\)）]\s*/g, '')
    .replace(/[【\[\(（]性能[】\]\)）]\s*/g, '')
    .trim()
}

function validateSchema(data: unknown): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: '返回格式异常（非 JSON 对象）' }
  }
  const obj = data as Record<string, unknown>
  if (typeof obj.title !== 'string' || !obj.title.trim()) {
    return { valid: false, error: '返回缺少 title 字段或为空' }
  }
  if (!Array.isArray(obj.testCases)) {
    return { valid: false, error: '返回缺少 testCases 数组' }
  }
  if (obj.testCases.length === 0) {
    return { valid: false, error: '未生成用例，请尝试提供更详细的需求描述' }
  }
  return { valid: true }
}

export function parseTestCases(raw: string): ParseResult {
  if (!raw || !raw.trim()) {
    return { success: false, error: '返回内容为空', refusal: false }
  }

  const refusalType = detectRefusal(raw)
  if (refusalType === 'refusal') {
    return {
      success: false,
      error: '无法处理此需求，可能包含不支持的内容。请尝试换个角度描述需求。',
      refusal: true,
    }
  }
  if (refusalType === 'need_more_detail') {
    return {
      success: false,
      error: '需求描述不够详细，无法生成用例。请提供更具体的功能描述（建议 20 字以上）。',
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
      return { success: false, error: '返回格式异常，请重试', refusal: false }
    }
  }

  const validation = validateSchema(parsed)
  if (!validation.valid) {
    return { success: false, error: validation.error!, refusal: false }
  }

  const result = parsed as TestCaseResult
  // Normalize test cases: dedup IDs, clean titles, align steps/expected
  const seenIds = new Set<string>()
  result.testCases = result.testCases.map((tc, i) => {
    let id = tc.id || `TC-${String(i + 1).padStart(3, '0')}`
    if (seenIds.has(id)) {
      let suffix = 1
      while (seenIds.has(`${id}-${suffix}`)) suffix++
      id = `${id}-${suffix}`
    }
    seenIds.add(id)
    const expected = Array.isArray(tc.expected) ? tc.expected : [tc.expected || '']
    const steps = Array.isArray(tc.steps) ? tc.steps : [tc.steps || '']
    while (expected.length < steps.length) expected.push('')
    const expectedTrimmed = expected.slice(0, steps.length)
    return {
      ...tc,
      id,
      steps,
      expected: expectedTrimmed,
      title: stripTypeLabels(tc.title),
    }
  })
  return { success: true, data: result }
}
