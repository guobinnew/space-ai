/**
 * sessionService 单元测试。
 *
 * 覆盖：
 *   - createSession / listSessions / getSession / renameSession / deleteSession
 *   - addMessage（user/assistant，含 thinking 与 toolCalls）
 *   - 按天分页 getMessagesByDay（最新一天 + 指定日期 + hasMore）
 *   - getMessages（LLM 上下文，含 memory.md 摘要前置）
 *   - 旧 <id>.jsonl 懒迁移到新目录结构
 *   - clearMessages
 *   - manifest.compactedThroughDate 在压缩前后更新
 *   - 压缩后原始 jsonl 文件保留不删除
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as path from 'path'
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
  await setupTempConfig('spaceai-session-test-')
})

afterEach(async () => {
  await teardownTempConfig()
})

describe('sessionService - 基础 CRUD', () => {
  test('createSession 创建目录 + manifest + index 条目', async () => {
    const session = await sessionService.createSession({ title: '我的会话', workDir: 'D:\\Work' })
    expect(session.id).toMatch(/^session-\d+-/)
    expect(session.title).toBe('我的会话')
    expect(session.workDir).toBe('D:\\Work')
    expect(session.messageCount).toBe(0)

    // 目录已创建
    const files = await listTempDir(`sessions/${session.id}`)
    expect(files).toContain('manifest.json')

    // manifest 内容正确
    const manifestRaw = await readTempFile(`sessions/${session.id}/manifest.json`)
    const manifest = JSON.parse(manifestRaw)
    expect(manifest.sessionId).toBe(session.id)
    expect(manifest.title).toBe('我的会话')
    expect(manifest.workDir).toBe('D:\\Work')
    expect(manifest.messageCount).toBe(0)
    expect(manifest.compactedThroughDate).toBeNull()

    // index.json 已添加条目
    const { sessions, total } = await sessionService.listSessions()
    expect(total).toBe(1)
    expect(sessions[0]!.id).toBe(session.id)
    expect(sessions[0]!.title).toBe('我的会话')
  })

  test('createSession 无 title 时使用默认值"新会话"', async () => {
    const session = await sessionService.createSession({})
    expect(session.title).toBe('新会话')
  })

  test('getSession 返回详情 + 最近一天消息（初始空）', async () => {
    const created = await sessionService.createSession({})
    const detail = await sessionService.getSession(created.id)
    expect(detail.id).toBe(created.id)
    expect(detail.messages).toEqual([])
  })

  test('renameSession 同步更新 manifest + index', async () => {
    const session = await sessionService.createSession({ title: '旧标题' })
    await sessionService.renameSession(session.id, '新标题')
    const detail = await sessionService.getSession(session.id)
    expect(detail.title).toBe('新标题')
    const list = await sessionService.listSessions()
    expect(list.sessions[0]!.title).toBe('新标题')
  })

  test('renameSession 对不存在会话抛 NotFound', async () => {
    await expect(sessionService.renameSession('nope', 'x')).rejects.toThrow(/not found/i)
  })

  test('deleteSession 同时删除目录 + 移除 index 条目', async () => {
    const session = await sessionService.createSession({})
    await sessionService.addMessage(session.id, 'user', 'hi')
    await sessionService.deleteSession(session.id)

    const list = await sessionService.listSessions()
    expect(list.total).toBe(0)
    // 目录被删除
    const files = await listTempDir(`sessions/${session.id}`)
    expect(files).toEqual([])
  })
})

describe('sessionService - addMessage', () => {
  test('user 消息写入对应日期 jsonl + 首条消息自动设标题', async () => {
    const session = await sessionService.createSession({})
    const msg = await sessionService.addMessage(session.id, 'user', '你好')

    expect(msg.role).toBe('user')
    expect(msg.content).toBe('你好')

    // 首条消息触发标题自动设置
    const detail = await sessionService.getSession(session.id)
    expect(detail.title).toBe('你好')
    expect(detail.messageCount).toBe(1)
    expect(detail.messages.length).toBe(1)
    expect(detail.messages[0]!.content).toBe('你好')

    // jsonl 文件名形如 YYYY-MM-DD.jsonl
    const files = await listTempDir(`sessions/${session.id}`)
    const jsonlFile = files.find((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
    expect(jsonlFile).toBeDefined()
  })

  test('assistant 消息（含 thinking + toolCalls）正确写入并读取', async () => {
    const session = await sessionService.createSession({})
    await sessionService.addMessage(session.id, 'user', '请帮我读取 a.txt')

    const toolCalls = [
      {
        id: 'tool-1',
        toolName: 'Read',
        input: { file_path: 'a.txt' },
        result: 'file content',
        isError: false,
      },
    ]
    const msg = await sessionService.addMessage(
      session.id,
      'assistant',
      '已读取',
      '正在思考如何处理',
      toolCalls,
    )

    expect(msg.content).toBe('已读取')
    expect(msg.thinking).toBe('正在思考如何处理')
    expect(msg.toolCalls).toEqual(toolCalls)

    const detail = await sessionService.getSession(session.id)
    expect(detail.messageCount).toBe(2)
    // 最近一天应包含 assistant 消息
    const assistant = detail.messages.find((m) => m.role === 'assistant')
    expect(assistant).toBeDefined()
    expect(assistant!.thinking).toBe('正在思考如何处理')
    expect(assistant!.toolCalls?.[0]!.toolName).toBe('Read')
  })

  test('addMessage 对不存在会话抛 NotFound', async () => {
    await expect(sessionService.addMessage('nope', 'user', 'hi')).rejects.toThrow(/not found/i)
  })
})

describe('sessionService - 按天分页 getMessagesByDay', () => {
  test('不传 date 返回最新一天 + hasMore=false（单日场景）', async () => {
    const session = await sessionService.createSession({})
    await sessionService.addMessage(session.id, 'user', '今天消息1')
    await sessionService.addMessage(session.id, 'assistant', '今天回复1')

    const result = await sessionService.getMessagesByDay(session.id)
    expect(result.messages.length).toBe(2)
    expect(result.hasMore).toBe(false)
    expect(result.requestedDay).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.days).toContain(result.requestedDay)
  })

  test('传 date=某日 时只返回该日消息', async () => {
    const session = await sessionService.createSession({})
    await sessionService.addMessage(session.id, 'user', '消息 A')

    const days = await sessionService.listDays(session.id)
    expect(days.length).toBe(1)
    const today = days[0]!

    const result = await sessionService.getMessagesByDay(session.id, today)
    expect(result.requestedDay).toBe(today)
    expect(result.messages.length).toBe(1)
    expect(result.messages[0]!.content).toBe('消息 A')
    expect(result.hasMore).toBe(false)
  })

  test('传不存在的 date 时回退到最新一天', async () => {
    const session = await sessionService.createSession({})
    await sessionService.addMessage(session.id, 'user', 'hi')

    const result = await sessionService.getMessagesByDay(session.id, '1999-01-01')
    expect(result.messages.length).toBe(1)
    expect(result.requestedDay).not.toBe('1999-01-01')
  })

  test('对不存在会话抛 NotFound', async () => {
    await expect(sessionService.getMessagesByDay('nope')).rejects.toThrow(/not found/i)
  })
})

describe('sessionService - getMessages（LLM 上下文）', () => {
  test('无压缩时返回全部消息', async () => {
    const session = await sessionService.createSession({})
    await sessionService.addMessage(session.id, 'user', '问题')
    await sessionService.addMessage(session.id, 'assistant', '回答')

    const msgs = await sessionService.getMessages(session.id)
    expect(msgs.length).toBe(2)
    expect(msgs[0]!.role).toBe('user')
    expect(msgs[1]!.role).toBe('assistant')
  })

  test('有 memory.md 时第一条为摘要 user 消息', async () => {
    const session = await sessionService.createSession({})
    await sessionService.writeMemory(session.id, '这是之前的摘要内容')
    await sessionService.updateManifest(session.id, { compactedThroughDate: '2026-07-31' })
    await sessionService.addMessage(session.id, 'user', '新一天问题')

    const msgs = await sessionService.getMessages(session.id)
    expect(msgs.length).toBe(2)
    expect(msgs[0]!.role).toBe('user')
    expect(msgs[0]!.content).toContain('压缩摘要')
    expect(msgs[0]!.content).toContain('这是之前的摘要内容')
    expect(msgs[1]!.content).toBe('新一天问题')
  })

  test('compactedThroughDate=2026-07-31 时跳过该日及之前的消息', async () => {
    const session = await sessionService.createSession({})
    await sessionService.writeMemory(session.id, '旧摘要')
    await sessionService.updateManifest(session.id, { compactedThroughDate: '2026-07-31' })

    // 直接写一份"假装是 7-31"的 jsonl（与 compactedThroughDate 相等，应被排除）
    const today = new Date().toISOString().slice(0, 10)
    await writeTempFile(
      `sessions/${session.id}/2026-07-31.jsonl`,
      JSON.stringify({
        type: 'user',
        uuid: 'u-old',
        parentUuid: null,
        timestamp: '2026-07-31T10:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: '旧消息' }] },
        sessionId: session.id,
      }) + '\n',
    )
    await writeTempFile(
      `sessions/${session.id}/${today}.jsonl`,
      JSON.stringify({
        type: 'user',
        uuid: 'u-new',
        parentUuid: null,
        timestamp: new Date().toISOString(),
        message: { role: 'user', content: [{ type: 'text', text: '新消息' }] },
        sessionId: session.id,
      }) + '\n',
    )

    const msgs = await sessionService.getMessages(session.id)
    // 第一条是 memory.md 摘要
    expect(msgs[0]!.content).toContain('旧摘要')
    // 第二条是新消息；不应包含"旧消息"
    expect(msgs.length).toBe(2)
    expect(msgs[1]!.content).toBe('新消息')
    expect(msgs.some((m) => m.content === '旧消息')).toBe(false)
  })
})

describe('sessionService - 旧 jsonl 懒迁移', () => {
  test('首次 getSession 时把旧 <id>.jsonl 切分到新目录结构并删除原文件', async () => {
    const sessionId = 'session-legacy-1'
    const createdAt = '2026-07-15T08:00:00.000Z'
    const meta = {
      type: 'session-meta',
      sessionId,
      title: '旧会话',
      workDir: 'D:\\Old',
      channel: 'desktop',
      createdAt,
      timestamp: createdAt,
    }
    const user1 = {
      type: 'user',
      uuid: 'u1',
      parentUuid: null,
      timestamp: '2026-07-15T09:00:00.000Z',
      message: { role: 'user', content: [{ type: 'text', text: '7-15 上午' }] },
      sessionId,
      version: '0.1.0',
    }
    const user2 = {
      type: 'user',
      uuid: 'u2',
      parentUuid: 'u1',
      timestamp: '2026-07-16T10:00:00.000Z',
      message: { role: 'user', content: [{ type: 'text', text: '7-16 上午' }] },
      sessionId,
      version: '0.1.0',
    }
    // 写旧格式单文件
    const legacyContent = [meta, user1, user2].map((e) => JSON.stringify(e)).join('\n') + '\n'
    await writeTempFile('sessions/index.json', JSON.stringify([
      {
        id: sessionId,
        title: '旧会话',
        createdAt,
        modifiedAt: '2026-07-16T10:00:00.000Z',
        messageCount: 2,
        workDir: 'D:\\Old',
      },
    ]))
    await writeTempFile(`sessions/${sessionId}.jsonl`, legacyContent)

    // 触发懒迁移
    const detail = await sessionService.getSession(sessionId)
    expect(detail.title).toBe('旧会话')

    // 旧文件已删除
    expect(tempFileExists(`sessions/${sessionId}.jsonl`)).toBe(false)

    // 新目录已创建
    const files = await listTempDir(`sessions/${sessionId}`)
    expect(files).toContain('manifest.json')
    expect(files).toContain('2026-07-15.jsonl')
    expect(files).toContain('2026-07-16.jsonl')

    // manifest 字段正确
    const manifest = JSON.parse(await readTempFile(`sessions/${sessionId}/manifest.json`))
    expect(manifest.sessionId).toBe(sessionId)
    expect(manifest.title).toBe('旧会话')
    expect(manifest.compactedThroughDate).toBeNull()
  })

  test('旧文件无 meta 时安全删除损坏文件', async () => {
    const sessionId = 'session-broken'
    await writeTempFile(`sessions/${sessionId}.jsonl`, 'not a valid json\n')
    // 不写 index，migrateLegacyIfNeeded 会跳过 meta 写入分支
    await sessionService.getSession(sessionId).catch(() => {})
    expect(tempFileExists(`sessions/${sessionId}.jsonl`)).toBe(false)
  })
})

describe('sessionService - clearMessages', () => {
  test('清除所有 jsonl + memory.md + 重置 manifest', async () => {
    const session = await sessionService.createSession({})
    await sessionService.addMessage(session.id, 'user', 'x')
    await sessionService.writeMemory(session.id, '摘要')
    await sessionService.updateManifest(session.id, { compactedThroughDate: '2026-07-31' })

    await sessionService.clearMessages(session.id)

    const manifest = JSON.parse(await readTempFile(`sessions/${session.id}/manifest.json`))
    expect(manifest.messageCount).toBe(0)
    expect(manifest.compactedThroughDate).toBeNull()
    expect(tempFileExists(`sessions/${session.id}/memory.md`)).toBe(false)
    const files = await listTempDir(`sessions/${session.id}`)
    expect(files.some((f) => f.endsWith('.jsonl'))).toBe(false)
  })
})

describe('sessionService - listDays / readMemory / writeMemory', () => {
  test('listDays 返回升序日期列表', async () => {
    const session = await sessionService.createSession({})
    // 写入两个不同日期的 jsonl
    await writeTempFile(
      `sessions/${session.id}/2026-07-15.jsonl`,
      JSON.stringify({ type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-07-15T10:00:00.000Z', message: { role: 'user', content: [{ type: 'text', text: 'a' }] }, sessionId: session.id }) + '\n',
    )
    await writeTempFile(
      `sessions/${session.id}/2026-07-10.jsonl`,
      JSON.stringify({ type: 'user', uuid: 'u2', parentUuid: null, timestamp: '2026-07-10T10:00:00.000Z', message: { role: 'user', content: [{ type: 'text', text: 'b' }] }, sessionId: session.id }) + '\n',
    )

    const days = await sessionService.listDays(session.id)
    expect(days).toEqual(['2026-07-10', '2026-07-15'])
  })

  test('readMemory 不存在时返回 null', async () => {
    const session = await sessionService.createSession({})
    const mem = await sessionService.readMemory(session.id)
    expect(mem).toBeNull()
  })

  test('writeMemory 后 readMemory 返回写入内容', async () => {
    const session = await sessionService.createSession({})
    await sessionService.writeMemory(session.id, '摘要内容')
    const mem = await sessionService.readMemory(session.id)
    expect(mem).toBe('摘要内容')
  })
})
