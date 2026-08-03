/**
 * compactPrompt 单元测试。
 *
 * 覆盖：
 *   - getCompactSystemPrompt / getCompactPrompt 返回结构
 *   - formatCompactSummary 剥离 <analysis>、提取 <summary>、合并多余空行
 *   - getCompactUserSummaryMessage 完整消息文本
 */

import { describe, test, expect } from 'bun:test'
import {
  getCompactSystemPrompt,
  getCompactPrompt,
  formatCompactSummary,
  getCompactUserSummaryMessage,
} from '../constants/compactPrompt'

describe('getCompactSystemPrompt', () => {
  test('返回非空字符串', () => {
    const p = getCompactSystemPrompt()
    expect(typeof p).toBe('string')
    expect(p.length).toBeGreaterThan(0)
    // COMPACT_SYSTEM_PROMPT = 'You are a helpful assistant that creates detailed summaries of conversations.'
    expect(p).toContain('summaries')
  })
})

describe('getCompactPrompt', () => {
  test('包含关键章节列表（1-9 段）', () => {
    const p = getCompactPrompt()
    expect(p).toContain('Primary Request and Intent')
    expect(p).toContain('Key Technical Concepts')
    expect(p).toContain('Files and Code Sections')
    expect(p).toContain('Errors and fixes')
    expect(p).toContain('Problem Solving')
    expect(p).toContain('All user messages')
    expect(p).toContain('Pending Tasks')
    expect(p).toContain('Current Work')
    expect(p).toContain('Optional Next Step')
  })

  test('开头有禁止使用工具的强烈警告', () => {
    const p = getCompactPrompt()
    expect(p).toMatch(/CRITICAL.*Respond with TEXT ONLY/i)
    expect(p).toContain('Do NOT use')
  })

  test('要求 <analysis> + <summary> 块格式', () => {
    const p = getCompactPrompt()
    expect(p).toContain('<analysis>')
    expect(p).toContain('<summary>')
  })
})

describe('formatCompactSummary', () => {
  test('剥离 <analysis> 块', () => {
    const input = '<analysis>草稿思考</analysis>\n\n<summary>实际摘要</summary>'
    const out = formatCompactSummary(input)
    expect(out).not.toContain('草稿思考')
    expect(out).toContain('实际摘要')
  })

  test('提取 <summary> 内容并加上 Summary: 前缀', () => {
    const input = '<summary>\n## 标题\n- 内容1\n- 内容2\n</summary>'
    const out = formatCompactSummary(input)
    expect(out).toMatch(/^Summary:/)
    expect(out).toContain('## 标题')
    expect(out).toContain('内容1')
    expect(out).toContain('内容2')
    expect(out).not.toContain('<summary>')
    expect(out).not.toContain('</summary>')
  })

  test('合并多个连续空行为最多 1 个', () => {
    const input = 'a\n\n\n\n\nb\n\n\nc'
    const out = formatCompactSummary(input)
    expect(out).not.toMatch(/\n{3,}/)
    expect(out).toContain('a')
    expect(out).toContain('b')
    expect(out).toContain('c')
  })

  test('去除首尾空白', () => {
    const input = '   \n\n实际内容\n\n   '
    const out = formatCompactSummary(input)
    expect(out.startsWith('实际内容')).toBe(true)
    expect(out.endsWith('实际内容')).toBe(true)
  })

  test('无 summary 块时原样输出（除空白处理）', () => {
    const input = '没有标签的纯文本'
    const out = formatCompactSummary(input)
    expect(out).toBe('没有标签的纯文本')
  })

  test('多个 analysis 块都被剥离', () => {
    const input = '<analysis>分析1</analysis>保留<analysis>分析2</analysis><summary>结果</summary>'
    const out = formatCompactSummary(input)
    expect(out).not.toContain('分析1')
    expect(out).not.toContain('分析2')
    expect(out).toContain('保留')
    expect(out).toContain('结果')
  })

  test('嵌套式 analysis 不影响后续 summary 提取', () => {
    const input = '前置文本<analysis>复杂</analysis>中间<summary>最终</summary>后置'
    const out = formatCompactSummary(input)
    expect(out).toContain('Summary:')
    expect(out).toContain('最终')
    expect(out).not.toContain('复杂')
    // 前后置文本是否被保留无所谓，主要是 analysis 必须被剥离
    expect(out).not.toContain('<analysis>')
  })
})

describe('getCompactUserSummaryMessage', () => {
  test('包含延续会话的说明 + 格式化后的摘要', () => {
    const input = '<analysis>内部</analysis><summary>关键内容</summary>'
    const msg = getCompactUserSummaryMessage(input)
    expect(msg).toMatch(/continued from a previous conversation/i)
    expect(msg).toContain('关键内容')
    expect(msg).not.toContain('内部') // analysis 被剥离
    expect(msg).not.toContain('<summary>')
  })

  test('包含继续指示词（Continue the conversation）', () => {
    const msg = getCompactUserSummaryMessage('<summary>x</summary>')
    expect(msg).toMatch(/Continue the conversation|Resume/i)
  })
})
