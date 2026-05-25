import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCallAI, mockRateLimit } = vi.hoisted(() => ({
  mockCallAI: vi.fn(),
  mockRateLimit: vi.fn(),
}))

vi.mock('@/lib/ai-provider', () => ({
  callAIProvider: mockCallAI,
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockRateLimit,
}))

import { POST } from '@/app/api/generate/route'

function createRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  text: '用户登录功能需求：支持用户名密码登录，错误3次锁定30分钟',
  images: [],
}

describe('POST /api/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRateLimit.mockResolvedValue({ allowed: true })
  })

  it('returns 200 with test cases on success', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: {
        title: '用户登录功能',
        summary: '测试登录流程',
        testCases: [
          { id: 'TC-001', title: '正常登录', precondition: '', steps: [], expected: '', priority: 'P0', type: '功能' },
        ],
        fuzzyPoints: [],
      },
      metadata: { provider: 'deepseek', model: 'deepseek-v4', durationMs: 5000, tokens: 1500 },
    })

    const response = await POST(createRequest(validBody))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.title).toBe('用户登录功能')
    expect(body.metadata.provider).toBe('deepseek')
  })

  it('returns 400 when text field is missing', async () => {
    const response = await POST(createRequest({ images: [] }))
    expect(response.status).toBe(400)
  })

  it('returns 400 when text is empty string', async () => {
    const response = await POST(createRequest({ text: '', images: [] }))
    expect(response.status).toBe(400)
  })

  it('returns 400 when text is whitespace only', async () => {
    const response = await POST(createRequest({ text: '   ', images: [] }))
    expect(response.status).toBe(400)
  })

  it('returns 400 when text exceeds 10000 characters', async () => {
    const response = await POST(createRequest({ text: 'x'.repeat(10001), images: [] }))
    expect(response.status).toBe(400)
  })

  it('accepts text at exactly 10000 characters', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: { title: '测试', summary: '', testCases: [{ id: 'TC-001', title: '用例', precondition: '', steps: [], expected: '', priority: 'P0', type: '功能' }], fuzzyPoints: [] },
      metadata: { provider: 'deepseek', model: 'v4', durationMs: 100, tokens: 100 },
    })

    const response = await POST(createRequest({ text: 'x'.repeat(10000), images: [] }))
    expect(response.status).toBe(200)
  })

  it('returns 429 when rate limited', async () => {
    mockRateLimit.mockResolvedValueOnce({ allowed: false })

    const response = await POST(createRequest(validBody))
    expect(response.status).toBe(429)
  })

  it('passes through when rate limiter fails (fail-open)', async () => {
    mockRateLimit.mockRejectedValueOnce(new Error('KV connection error'))
    mockCallAI.mockResolvedValueOnce({
      success: true,
      data: { title: '测试', summary: '', testCases: [{ id: 'TC-001', title: '用例', precondition: '', steps: [], expected: '', priority: 'P0', type: '功能' }], fuzzyPoints: [] },
      metadata: { provider: 'deepseek', model: 'v4', durationMs: 100, tokens: 100 },
    })

    const response = await POST(createRequest(validBody))
    expect(response.status).toBe(200)
  })

  it('returns 400 when more than 3 images', async () => {
    const response = await POST(createRequest({ text: '测试', images: ['img1', 'img2', 'img3', 'img4'] }))
    expect(response.status).toBe(400)
  })

  it('returns 500 when AI provider fails', async () => {
    mockCallAI.mockResolvedValueOnce({
      success: false,
      error: 'AI 服务暂时不可用',
      metadata: { provider: 'deepseek', model: 'v4', durationMs: 30000, tokens: 0 },
    })

    const response = await POST(createRequest(validBody))
    expect(response.status).toBe(500)
  })

  it('returns 400 when request body is not valid JSON', async () => {
    const request = new Request('http://localhost:3000/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})
