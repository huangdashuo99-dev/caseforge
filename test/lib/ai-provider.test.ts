import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()

vi.mock('openai', () => ({
  default: vi.fn(function (this: Record<string, unknown>) {
    this.chat = { completions: { create: mockCreate } }
  }),
}))

import { callAIProvider, type ProviderConfig } from '@/lib/ai-provider'

const primaryConfig: ProviderConfig = {
  name: 'deepseek',
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: 'sk-test-primary',
  model: 'deepseek-v4',
}

const fallbackConfig: ProviderConfig = {
  name: 'qwen',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: 'sk-test-fallback',
  model: 'qwen3.5-plus',
}

const validContent = '{"title":"测试","summary":"","testCases":[{"id":"TC-001","title":"用例","precondition":"","steps":[],"expected":"","priority":"P0","type":"功能"}],"fuzzyPoints":[]}'

function mockSuccess() {
  mockCreate.mockResolvedValueOnce({
    choices: [{ message: { content: validContent } }],
    usage: { total_tokens: 1000 },
  })
}

describe('callAIProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns parsed result on successful AI call', async () => {
    mockSuccess()

    const result = await callAIProvider({
      primary: primaryConfig,
      systemPrompt: '你是 QA 测试专家',
      userText: '生成登录功能的测试用例',
      images: [],
    })

    if (!result.success) throw new Error('expected success')
    expect(result.data.testCases).toHaveLength(1)
    expect(result.metadata.provider).toBe('deepseek')
    expect(result.metadata.model).toBe('deepseek-v4')
    expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.metadata.tokens).toBe(1000)
  })

  it('constructs vision messages when images are provided', async () => {
    mockSuccess()

    const imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    await callAIProvider({
      primary: primaryConfig,
      systemPrompt: '你是 QA',
      userText: '测试',
      images: [imageBase64],
    })

    const callArgs = mockCreate.mock.calls[0][0]
    const userContent = callArgs.messages[1].content
    expect(Array.isArray(userContent)).toBe(true)
    expect(userContent[0]).toEqual({ type: 'text', text: '测试' })
    expect(userContent[1]).toEqual({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${imageBase64}` },
    })
  })

  it('retries once on timeout, then succeeds', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Request timed out'))
    mockSuccess()

    const result = await callAIProvider({
      primary: primaryConfig,
      systemPrompt: '你是 QA',
      userText: '测试',
      images: [],
    })

    expect(result.success).toBe(true)
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('retries only once, not indefinitely', async () => {
    mockCreate.mockRejectedValue(new Error('Request timed out'))

    const result = await callAIProvider({
      primary: primaryConfig,
      systemPrompt: '你是 QA',
      userText: '测试',
      images: [],
    })

    expect(result.success).toBe(false)
    expect(mockCreate).toHaveBeenCalledTimes(2) // 1 initial + 1 retry
  })

  it('falls back to backup model when primary fails', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('Primary error'))
      .mockResolvedValueOnce({
        choices: [{ message: { content: validContent } }],
        usage: { total_tokens: 600 },
      })

    const result = await callAIProvider({
      primary: primaryConfig,
      fallback: fallbackConfig,
      systemPrompt: '你是 QA',
      userText: '测试',
      images: [],
    })

    if (!result.success) throw new Error('expected success')
    expect(result.metadata.provider).toBe('qwen')
    expect(result.metadata.model).toBe('qwen3.5-plus')
  })

  it('returns error when all providers fail', async () => {
    mockCreate.mockRejectedValue(new Error('All APIs down'))

    const result = await callAIProvider({
      primary: primaryConfig,
      fallback: fallbackConfig,
      systemPrompt: '你是 QA',
      userText: '测试',
      images: [],
    })

    if (result.success) throw new Error('expected error')
    expect(result.error).toContain('服务暂时不可用')
  })

  it('returns error when primary fails and no fallback', async () => {
    mockCreate.mockRejectedValue(new Error('API error'))

    const result = await callAIProvider({
      primary: primaryConfig,
      systemPrompt: '你是 QA',
      userText: '测试',
      images: [],
    })

    expect(result.success).toBe(false)
  })

  it('handles empty AI response', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '' } }],
      usage: { total_tokens: 0 },
    })

    const result = await callAIProvider({
      primary: primaryConfig,
      systemPrompt: '你是 QA',
      userText: '测试',
      images: [],
    })

    expect(result.success).toBe(false)
  })

  it('handles null AI response content', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
      usage: { total_tokens: 0 },
    })

    const result = await callAIProvider({
      primary: primaryConfig,
      systemPrompt: '你是 QA',
      userText: '测试',
      images: [],
    })

    expect(result.success).toBe(false)
  })
})
