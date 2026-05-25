import { describe, it, expect } from 'vitest'
import { parseTestCases } from '@/lib/json-parser'

const minimalValidJson = () =>
  JSON.stringify({
    title: '测试',
    summary: '',
    testCases: [{ id: 'TC-001', title: '用例', precondition: '', steps: [], expected: '', priority: 'P0', type: '功能' }],
    fuzzyPoints: [],
  })

const minimalValidObj = () => ({
  title: '测试',
  summary: '',
  testCases: [{ id: 'TC-001', title: '用例', precondition: '', steps: [], expected: '', priority: 'P0', type: '功能' }],
  fuzzyPoints: [],
})

describe('parseTestCases', () => {
  // === HAPPY PATH ===
  it('parses valid JSON with all fields', () => {
    const input = JSON.stringify({
      title: '用户登录功能',
      summary: '验证登录流程',
      testCases: [
        {
          id: 'TC-001',
          title: '正常登录',
          precondition: '已有账号',
          steps: ['打开登录页', '输入用户名密码', '点击登录'],
          expected: '跳转到首页',
          priority: 'P0',
          type: '功能',
        },
      ],
      fuzzyPoints: [],
    })
    const result = parseTestCases(input)
    expect(result.success).toBe(true)
    expect(result.data!.title).toBe('用户登录功能')
    expect(result.data!.testCases).toHaveLength(1)
  })

  it('handles multiple test cases', () => {
    const input = JSON.stringify({
      title: '测试',
      summary: '摘要',
      testCases: [
        { id: 'TC-001', title: '用例1', precondition: '', steps: [], expected: '', priority: 'P0', type: '功能' },
        { id: 'TC-002', title: '用例2', precondition: '', steps: [], expected: '', priority: 'P1', type: '边界值' },
      ],
      fuzzyPoints: [],
    })
    const result = parseTestCases(input)
    expect(result.success).toBe(true)
    expect(result.data!.testCases).toHaveLength(2)
  })

  // === MARKDOWN CODE FENCE STRIPPING ===
  it('strips ```json code fences', () => {
    const json = minimalValidJson()
    const input = '```json\n' + json + '\n```'
    const result = parseTestCases(input)
    expect(result.success).toBe(true)
    expect(result.data!.title).toBe('测试')
  })

  it('strips ``` code fences without language', () => {
    const json = minimalValidJson()
    const input = '```\n' + json + '\n```'
    const result = parseTestCases(input)
    expect(result.success).toBe(true)
  })

  // === JSON SYNTAX FIXES ===
  it('fixes trailing commas in arrays', () => {
    const input = `{"title":"测试","summary":"","testCases":[{"id":"TC-001","title":"用例","precondition":"","steps":[],"expected":"","priority":"P0","type":"功能"}],"fuzzyPoints":[],}`
    const result = parseTestCases(input)
    expect(result.success).toBe(true)
  })

  it('fixes trailing commas in objects', () => {
    const input = `{"title":"测试","summary":"","testCases":[{"id":"TC-001","title":"用例","precondition":"","steps":[],"expected":"","priority":"P0","type":"功能",}],"fuzzyPoints":[]}`
    const result = parseTestCases(input)
    expect(result.success).toBe(true)
    expect(result.data!.testCases[0].title).toBe('用例')
  })

  // === SCHEMA VALIDATION ===
  it('rejects missing title field', () => {
    const input = JSON.stringify({ summary: '', testCases: [], fuzzyPoints: [] })
    const result = parseTestCases(input)
    expect(result.success).toBe(false)
    expect(result.error).toContain('title')
  })

  it('rejects missing testCases array', () => {
    const input = JSON.stringify({ title: '测试', summary: '', fuzzyPoints: [] })
    const result = parseTestCases(input)
    expect(result.success).toBe(false)
    expect(result.error).toContain('testCases')
  })

  it('rejects empty testCases with warning', () => {
    const input = JSON.stringify({ title: '测试', summary: '', testCases: [], fuzzyPoints: [] })
    const result = parseTestCases(input)
    expect(result.success).toBe(false)
    expect(result.error).toContain('未生成')
  })

  // === CONTENT REFUSAL DETECTION ===
  it('detects AI refusal in Chinese', () => {
    const result = parseTestCases('抱歉，我无法生成这个需求的测试用例，因为内容涉及敏感信息。')
    expect(result.success).toBe(false)
    expect(result.refusal).toBe(true)
    expect(result.error).toContain('无法处理')
  })

  it('detects AI refusal in English', () => {
    const result = parseTestCases('I cannot generate test cases for this requirement as it contains')
    expect(result.success).toBe(false)
    expect(result.refusal).toBe(true)
  })

  // === GARBAGE INPUT ===
  it('rejects completely invalid text gracefully', () => {
    const result = parseTestCases('这是一段随意的文字，完全不是 JSON 格式')
    expect(result.success).toBe(false)
    expect(result.refusal).toBe(false)
  })

  it('handles empty string', () => {
    const result = parseTestCases('')
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('handles null/undefined-like empty input', () => {
    const result = parseTestCases('   ')
    expect(result.success).toBe(false)
  })

  // === EDGE CASES ===
  it('handles BOM character at start', () => {
    const json = minimalValidJson()
    const result = parseTestCases('﻿' + json)
    expect(result.success).toBe(true)
  })

  it('trims leading/trailing whitespace', () => {
    const json = minimalValidJson()
    const result = parseTestCases('  \n  ' + json + '  \n  ')
    expect(result.success).toBe(true)
  })

  it('handles Chinese punctuation in JSON values', () => {
    const input = JSON.stringify({
      title: '测试——包含中文标点',
      summary: '【摘要】',
      testCases: [
        {
          id: 'TC-001',
          title: '测试「引号」和『书名号』',
          precondition: '前置条件：用户已登录。',
          steps: ['步骤1：打开页面', '步骤2：输入"中文引号"'],
          expected: '显示正确。',
          priority: 'P0',
          type: '功能',
        },
      ],
      fuzzyPoints: [],
    })
    const result = parseTestCases(input)
    expect(result.success).toBe(true)
    expect(result.data!.testCases[0].steps[1]).toContain('中文引号')
  })
})
