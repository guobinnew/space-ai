/**
 * compactService 单元测试。
 *
 * 覆盖：
 *   - shouldAutoCompact（基于 chars/4 token 估算）
 *   - isPromptTooLongError 多种 provider 错误消息匹配
 *   - pickCompactThroughDate 按天压缩截止日选择
 *   - splitForPartialCompact 切分前 K 条
 *   - microcompactInPlace 旧 tool_result 替换为占位符
 *   - compactByDays 端到端：触发 LLM 调用、写 memory.md、更新 manifest、保留原始 jsonl
 *   - compactByDays 与已有 memory.md 合并再总结
 *   - compactByDays 在只有 1 天时跳过
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  shouldAutoCompact,
  isPromptTooLongError,
  pickCompactThroughDate,
  splitForPartialCompact,
  microcompactInPlace,
  compactByDays,
  KEEP_RECENT_MESSAGES,
  KEEP_RECENT_TOOL_RESULTS,
  DEFAULT_CONTEXT_WINDOW_ANTHROPIC,
  DEFAULT_CONTEXT_WINDOW_OPENAI,
} from '../services/compactService'
import { sessionService } from '../services/sessionService'
import {
  setupTempConfig,
  teardownTempConfig,
  writeTempFile,
  readTempFile,
  tempFileExists,
  listTempDir,
} from './testHelpers'

beforeEach(async () => {
  await setupTempConfig('spaceai-compact-test-')
})

afterEach(async () => {
  await teardownTempConfig()
})

describe('shouldAutoCompact', () => {
  test('消息少于 4 条时不触发', () => {
    const messages = [{ content: 'short' }, { content: 'short' }]
    expect(shouldAutoCompact(messages, 200_000)).toBe(false)
  })

  test('消息长度低于阈值时不触发', () => {
    const messages = Array.from({ length: 4 }, (_, i) => ({ content: `msg-${i}` }))
    expect(shouldAutoCompact(messages, 200_000)).toBe(false)
  })

  test('消息长度超过阈值时触发（Anthropic 默认 200K）', () => {
    // 4 条消息，每条 200000 字符 = 800000 字符 ≈ 200000 tokens
    // 阈值 = 200000 - 20000 - 13000 = 167000 tokens，超过即触发
    const messages = Array.from({ length: 4 }, () => ({ content: 'x'.repeat(200_000) }))
    expect(shouldAutoCompact(messages, DEFAULT_CONTEXT_WINDOW_ANTHROPIC)).toBe(true)
  })

  test('OpenAI 默认 128K 阈值更低更易触发', () => {
    const messages = Array.from({ length: 4 }, () => ({ content: 'x'.repeat(40_000) }))
    // 160000 chars ≈ 40000 tokens，阈值 = 128000 - 20000 - 13000 = 95000 tokens
    expect(shouldAutoCompact(messages, DEFAULT_CONTEXT_WINDOW_OPENAI)).toBe(false)
    // 加长到 100000 字符每条
    const big = Array.from({ length: 4 }, () => ({ content: 'x'.repeat(100_000) }))
    expect(shouldAutoCompact(big, DEFAULT_CONTEXT_WINDOW_OPENAI)).toBe(true)
  })

  test('content 为数组时累加 text 与 thinking 字段长度', () => {
    const messages = [
      { content: [{ type: 'text', text: 'x'.repeat(200_000) }] },
      { content: [{ type: 'thinking', thinking: 'y'.repeat(200_000) }] },
      { content: [{ type: 'text', text: 'z'.repeat(200_000) }] },
      { content: [{ type: 'text', text: 'w'.repeat(200_000) }] },
    ]
    // 总长 800000 chars ≈ 200000 tokens，超过 167000 阈值
    expect(shouldAutoCompact(messages, DEFAULT_CONTEXT_WINDOW_ANTHROPIC)).toBe(true)
    // 短消息不触发
    const short = [
      { content: [{ type: 'text', text: 'short' }] },
      { content: [{ type: 'thinking', thinking: 'short' }] },
      { content: [{ type: 'text', text: 'short' }] },
      { content: [{ type: 'text', text: 'short' }] },
    ]
    expect(shouldAutoCompact(short, DEFAULT_CONTEXT_WINDOW_ANTHROPIC)).toBe(false)
  })
})

describe('isPromptTooLongError', () => {
  test('匹配 Anthropic "prompt is too long"', () => {
    expect(isPromptTooLongError(new Error('prompt is too long: 300000 > 200000'))).toBe(true)
  })

  test('匹配 OpenAI "context_length_exceeded"', () => {
    expect(isPromptTooLongError(new Error('context_length_exceeded'))).toBe(true)
  })

  test('匹配各种"too long" / "maximum context" 变体', () => {
    expect(isPromptTooLongError('This model maximum context is 128000')).toBe(true)
    expect(isPromptTooLongError('Request exceeds the model input length')).toBe(true)
    expect(isPromptTooLongError('Please reduce the length of the conversation')).toBe(true)
  })

  test('不匹配无关错误', () => {
    expect(isPromptTooLongError(new Error('Network error'))).toBe(false)
    expect(isPromptTooLongError(new Error('Internal server error'))).toBe(false)
    expect(isPromptTooLongError('')).toBe(false)
  })

  test('接受字符串与 Error 实例', () => {
    expect(isPromptTooLongError('some string')).toBe(false)
    expect(isPromptTooLongError('context_length_exceeded')).toBe(true)
  })
})

describe('pickCompactThroughDate', () => {
  test('null + 空数组 -> null', () => {
    expect(pickCompactThroughDate(null, [])).toBeNull()
  })

  test('null + 单日 -> null（保留最新一天不压缩）', () => {
    expect(pickCompactThroughDate(null, ['2026-08-01'])).toBeNull()
  })

  test('null + 多日 -> 返回倒数第二天', () => {
    const days = ['2026-07-01', '2026-07-15', '2026-08-01']
    expect(pickCompactThroughDate(null, days)).toBe('2026-07-15')
  })

  test('compactedThroughDate=2026-07-15 + 之后多日 -> 返回新截止日', () => {
    const days = ['2026-07-01', '2026-07-15', '2026-07-20', '2026-07-25', '2026-08-01']
    expect(pickCompactThroughDate('2026-07-15', days)).toBe('2026-07-25')
  })

  test('compactedThroughDate=2026-07-31 + 之后只有 1 天 -> null', () => {
    const days = ['2026-07-15', '2026-07-31', '2026-08-01']
    expect(pickCompactThroughDate('2026-07-31', days)).toBeNull()
  })

  test('compactedThroughDate 等于最新一天 -> null', () => {
    const days = ['2026-07-15', '2026-08-01']
    expect(pickCompactThroughDate('2026-08-01', days)).toBeNull()
  })

  test('days 未排序时按升序处理', () => {
    const days = ['2026-08-01', '2026-07-01', '2026-07-15']
    expect(pickCompactThroughDate(null, days)).toBe('2026-07-15')
  })
})

describe('splitForPartialCompact', () => {
  test('消息数 ≤ KEEP_RECENT_MESSAGES 时全部保留', () => {
    const messages = [1, 2, 3]
    const result = splitForPartialCompact(messages)
    expect(result.toSummarize).toEqual([])
    expect(result.toKeep).toEqual([1, 2, 3])
  })

  test(`消息数 > ${KEEP_RECENT_MESSAGES} 时切分前 N-${KEEP_RECENT_MESSAGES} 条摘要`, () => {
    const messages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const result = splitForPartialCompact(messages)
    expect(result.toSummarize).toEqual([1, 2, 3, 4])
    expect(result.toKeep).toEqual([5, 6, 7, 8, 9, 10])
  })

  test('边界：消息数刚好等于 KEEP_RECENT_MESSAGES', () => {
    const messages = Array.from({ length: KEEP_RECENT_MESSAGES }, (_, i) => i + 1)
    const result = splitForPartialCompact(messages)
    expect(result.toSummarize).toEqual([])
    expect(result.toKeep).toEqual(messages)
  })
})

describe('microcompactInPlace', () => {
  test(`保留最近 ${KEEP_RECENT_TOOL_RESULTS} 条消息，更早的 tool_result 替换为占位符`, () => {
    // 当前实现：保留 messages.length - KEEP_RECENT_TOOL_RESULTS 之前的所有消息不替换，
    // 之后倒序遍历到 index 0 把含 tool_result 的 user 消息替换。
    // 测试场景：6 条消息，KEEP_RECENT_TOOL_RESULTS=3，
    // 从 i = length-1-3 = 2 往前到 0，遍历 i=2,1,0
    type Msg = {
      role: 'user'
      content: Array<{ type: string; tool_use_id?: string; content: string }>
    }
    const makeTool = (id: string) => ({
      role: 'user' as const,
      content: [{ type: 'tool_result', tool_use_id: id, content: `result-${id}` }],
    })
    const makeText = (t: string) => ({
      role: 'user' as const,
      content: [{ type: 'text', text: t }],
    })

    const messages: Msg[] = [
      makeTool('t1'),
      makeTool('t2'),
      makeTool('t3'),
      makeTool('t4'),
      makeTool('t5'),
      makeText('question'),
    ]
    // 从 i=2 倒序到 0：i=2,1,0 三条 tool_result 被替换
    const truncated = microcompactInPlace(messages as any)
    expect(truncated).toBe(3)
    const toolResults = messages.map((m) => m.content[0])
    expect(toolResults[0]!.content).toBe('[tool output truncated to save context]')
    expect(toolResults[1]!.content).toBe('[tool output truncated to save context]')
    expect(toolResults[2]!.content).toBe('[tool output truncated to save context]')
    expect(toolResults[3]!.content).toBe('result-t4')
    expect(toolResults[4]!.content).toBe('result-t5')
    expect(toolResults[5]!.type).toBe('text')
  })

  test('tool_result 数量不超过 KEEP 时无替换', () => {
    const messages = [
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 't1', content: 'r1' }],
      },
      { role: 'user', content: [{ type: 'text', text: 'q' }] },
    ]
    const truncated = microcompactInPlace(messages as any)
    expect(truncated).toBe(0)
  })

  test('无 tool_result 时无替换', () => {
    const messages = [
      { role: 'user', content: [{ type: 'text', text: 'a' }] },
      { role: 'user', content: [{ type: 'text', text: 'b' }] },
    ]
    expect(microcompactInPlace(messages as any)).toBe(0)
  })
})

describe('compactByDays 端到端', () => {
  test('多日时触发 LLM 压缩，写 memory.md，更新 manifest，保留原始 jsonl', async () => {
    const session = await sessionService.createSession({})

    // 写两天的消息（用直接写 jsonl 的方式来控制日期）
    const day1 = '2026-07-15'
    const day2 = '2026-07-16'
    const writeDay = async (date: string, text: string) => {
      await writeTempFile(
        `sessions/${session.id}/${date}.jsonl`,
        JSON.stringify({
          type: 'user',
          uuid: `u-${date}`,
          parentUuid: null,
          timestamp: `${date}T10:00:00.000Z`,
          message: { role: 'user', content: [{ type: 'text', text }] },
          sessionId: session.id,
          version: '0.1.0',
        }) + '\n',
      )
    }
    await writeDay(day1, '7-15 消息')
    await writeDay(day2, '7-16 消息')

    // 模拟 LLM 调用
    const calls: Array<{ role: 'user' | 'assistant'; content: string }>[] = []
    const fakeLLM = async (msgs: Array<{ role: 'user' | 'assistant'; content: string }>) => {
      calls.push(msgs)
      return '<analysis>分析</analysis><summary>## 摘要内容\n- 关键点</summary>'
    }

    const result = await compactByDays(session.id, fakeLLM)
    expect(result).toBe(true)

    // 调用过 LLM（仅一次）
    expect(calls.length).toBe(1)
    // 传入的消息按时间顺序：只包含 7-15 一天（保留最新一天 7-16 不压缩）
    const firstCallMsgs = calls[0]!
    expect(firstCallMsgs.some((m) => m.content === '7-15 消息')).toBe(true)
    expect(firstCallMsgs.some((m) => m.content === '7-16 消息')).toBe(false)

    // memory.md 已写入，含格式化后的摘要（剥离 analysis）
    const memory = await sessionService.readMemory(session.id)
    expect(memory).toBeTruthy()
    expect(memory).toContain('压缩截止：2026-07-15')
    expect(memory).not.toContain('<analysis>')
    expect(memory).toContain('摘要内容')

    // manifest.compactedThroughDate = 2026-07-15（保留 7-16 不压缩）
    const manifest = JSON.parse(await readTempFile(`sessions/${session.id}/manifest.json`))
    expect(manifest.compactedThroughDate).toBe('2026-07-15')

    // 原始 jsonl 文件保留不删除
    expect(tempFileExists(`sessions/${session.id}/${day1}.jsonl`)).toBe(true)
    expect(tempFileExists(`sessions/${session.id}/${day2}.jsonl`)).toBe(true)

    // getMessages 现在返回 memory 摘要 + 7-16 消息（7-15 已被压缩排除）
    const msgs = await sessionService.getMessages(session.id)
    expect(msgs[0]!.role).toBe('user')
    expect(msgs[0]!.content).toContain('压缩摘要')
    expect(msgs.some((m) => m.content === '7-15 消息')).toBe(false)
    expect(msgs.some((m) => m.content === '7-16 消息')).toBe(true)
  })

  test('只有 1 天时跳过压缩（返回 false）', async () => {
    const session = await sessionService.createSession({})
    await sessionService.addMessage(session.id, 'user', '今天消息')

    const fakeLLM = async () => 'should not be called'
    const result = await compactByDays(session.id, fakeLLM)
    expect(result).toBe(false)

    // memory.md 不应被写入
    const memory = await sessionService.readMemory(session.id)
    expect(memory).toBeNull()
  })

  test('已有 memory.md 时合并旧摘要 + 新内容再总结', async () => {
    const session = await sessionService.createSession({})
    // 假装已经压缩到 2026-07-10，有旧摘要
    await sessionService.writeMemory(session.id, '## 旧摘要\n- 旧关键点')
    await sessionService.updateManifest(session.id, { compactedThroughDate: '2026-07-10' })

    // 之后再写两天的新消息
    await writeTempFile(
      `sessions/${session.id}/2026-07-11.jsonl`,
      JSON.stringify({
        type: 'user',
        uuid: 'u-711',
        parentUuid: null,
        timestamp: '2026-07-11T10:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: '7-11 消息' }] },
        sessionId: session.id,
      }) + '\n',
    )
    await writeTempFile(
      `sessions/${session.id}/2026-07-12.jsonl`,
      JSON.stringify({
        type: 'user',
        uuid: 'u-712',
        parentUuid: null,
        timestamp: '2026-07-12T10:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: '7-12 消息' }] },
        sessionId: session.id,
      }) + '\n',
    )

    // 模拟 LLM 被调用两次：第一次压缩新增内容，第二次合并旧+新
    let callCount = 0
    const fakeLLM = async () => {
      callCount++
      if (callCount === 1) return '<summary>新内容摘要</summary>'
      return '<summary>合并后的最终摘要</summary>'
    }

    const result = await compactByDays(session.id, fakeLLM)
    expect(result).toBe(true)
    expect(callCount).toBe(2)

    // memory.md 已更新为合并后的最终摘要
    const memory = await sessionService.readMemory(session.id)
    expect(memory).toContain('合并后的最终摘要')

    // compactedThroughDate 推进到 2026-07-11
    const manifest = JSON.parse(await readTempFile(`sessions/${session.id}/manifest.json`))
    expect(manifest.compactedThroughDate).toBe('2026-07-11')
  })

  test('LLM 调用失败时不写 memory.md，manifest 不变', async () => {
    const session = await sessionService.createSession({})
    await writeTempFile(
      `sessions/${session.id}/2026-07-15.jsonl`,
      JSON.stringify({
        type: 'user',
        uuid: 'u1',
        parentUuid: null,
        timestamp: '2026-07-15T10:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: '旧' }] },
        sessionId: session.id,
      }) + '\n',
    )
    await writeTempFile(
      `sessions/${session.id}/2026-07-16.jsonl`,
      JSON.stringify({
        type: 'user',
        uuid: 'u2',
        parentUuid: null,
        timestamp: '2026-07-16T10:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: '新' }] },
        sessionId: session.id,
      }) + '\n',
    )

    const failingLLM = async () => {
      throw new Error('LLM API error')
    }
    const onChunks: string[] = []
    const result = await compactByDays(session.id, failingLLM, (c) => {
      if (c.type === 'content_delta' && c.text) onChunks.push(c.text)
    })
    expect(result).toBe(false)

    // memory.md 未被写入
    expect(await sessionService.readMemory(session.id)).toBeNull()
    // manifest.compactedThroughDate 仍为 null
    const manifest = JSON.parse(await readTempFile(`sessions/${session.id}/manifest.json`))
    expect(manifest.compactedThroughDate).toBeNull()
    // 进度回调里包含失败提示
    expect(onChunks.some((t) => t.includes('压缩失败'))).toBe(true)
  })
})
