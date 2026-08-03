/**
 * Session Service — 会话管理（目录 + 按天 JSONL + memory.md 压缩）
 *
 * Storage layout:
 *   ~/.spaceai/sessions/
 *     ├── index.json                       (全局会话索引)
 *     └── session-<ts>-<rand>/
 *           ├── manifest.json              (会话元信息，含 compactedThroughDate)
 *           ├── memory.md                   (压缩摘要；触发压缩后生成/更新)
 *           ├── 2026-08-03.jsonl            (按天分文件)
 *           └── 2026-08-04.jsonl
 *
 * 兼容旧格式：检测 sessions/ 下的旧 <id>.jsonl 文件，懒迁移为新目录结构。
 *
 * 上下文拼装（供 LLM 调用使用）：
 *   1. 若 memory.md 存在：作为一条 user summary 消息插入开头
 *   2. 加载 compactedThroughDate 之后所有 jsonl 文件的消息
 *   3. 当前用户消息已在末尾
 */

import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import * as os from 'os'
import { ApiError } from '../middleware/errorHandler'
import type { SessionListItem, SessionDetail, ChatMessage, CreateSessionInput } from '../types/session'

/** JSONL 条目类型（保留原格式，兼容旧文件） */
type JsonlEntry = {
  type: 'session-meta'
  sessionId: string
  title?: string
  workDir?: string
  channel?: string
  createdAt: string
  timestamp: string
} | {
  type: 'user'
  uuid: string
  parentUuid: string | null
  timestamp: string
  message: {
    role: 'user'
    content: Array<{ type: 'text'; text: string } | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }>
  }
  sessionId: string
  version?: string
  cwd?: string
} | {
  type: 'assistant'
  uuid: string
  parentUuid: string | null
  timestamp: string
  message: {
    role: 'assistant'
    content: Array<
      | { type: 'thinking'; thinking: string; signature: string }
      | { type: 'text'; text: string }
      | { type: 'tool_use'; name: string; input: Record<string, unknown>; id: string }
    >
    model?: string
    id?: string
    usage?: Record<string, unknown>
    stop_reason?: string
  }
  sessionId: string
  version?: string
  cwd?: string
}

/** manifest.json 结构 */
type SessionManifest = {
  sessionId: string
  title: string
  workDir?: string
  channel: string
  createdAt: string
  modifiedAt: string
  messageCount: number
  /** 压缩截止日期（YYYY-MM-DD）。null 表示尚未压缩过。压缩后会更新为最近的被压缩日。 */
  compactedThroughDate: string | null
}

/** 按天文件名：YYYY-MM-DD.jsonl */
function dateFileName(dateStr: string): string {
  return `${dateStr}.jsonl`
}

/** 从 ISO timestamp 提取本地日期 YYYY-MM-DD */
function isoToLocalDate(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export class SessionService {
  // 实例化时不再固定 configDir/sessionsDir，运行时动态读取 env，便于测试隔离

  private get configDir(): string {
    return process.env.SPACEAI_CONFIG_DIR || path.join(os.homedir(), '.spaceai')
  }

  private get sessionsDir(): string {
    return path.join(this.configDir, 'sessions')
  }

  // ── Path helpers ─────────────────────────────────────────────

  private getIndexPath(): string {
    return path.join(this.sessionsDir, 'index.json')
  }

  /** 会话目录：sessions/<id>/ */
  private getSessionDir(id: string): string {
    return path.join(this.sessionsDir, id)
  }

  private getManifestPath(id: string): string {
    return path.join(this.getSessionDir(id), 'manifest.json')
  }

  private getMemoryPath(id: string): string {
    return path.join(this.getSessionDir(id), 'memory.md')
  }

  /** 按天 jsonl 路径：sessions/<id>/<YYYY-MM-DD>.jsonl */
  private getDatedJsonlPath(id: string, dateStr: string): string {
    return path.join(this.getSessionDir(id), dateFileName(dateStr))
  }

  /** 旧格式路径（兼容迁移）：sessions/<id>.jsonl */
  private getLegacyJsonlPath(id: string): string {
    return path.join(this.sessionsDir, `${id}.jsonl`)
  }

  private async ensureDirs(): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true })
  }

  private async ensureSessionDir(id: string): Promise<void> {
    await fs.mkdir(this.getSessionDir(id), { recursive: true })
  }

  private uuid(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  private now(): string {
    return new Date().toISOString()
  }

  // ── Index operations ─────────────────────────────────────────

  private async readIndex(): Promise<SessionListItem[]> {
    try {
      const raw = await fs.readFile(this.getIndexPath(), 'utf-8')
      return JSON.parse(raw) as SessionListItem[]
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw ApiError.internal(`Failed to read sessions index: ${err}`)
    }
  }

  private async writeIndex(sessions: SessionListItem[]): Promise<void> {
    await this.ensureDirs()
    await fs.writeFile(this.getIndexPath(), JSON.stringify(sessions, null, 2), 'utf-8')
  }

  // ── Manifest operations ──────────────────────────────────────

  private async readManifest(id: string): Promise<SessionManifest | null> {
    try {
      const raw = await fs.readFile(this.getManifestPath(id), 'utf-8')
      return JSON.parse(raw) as SessionManifest
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw ApiError.internal(`Failed to read manifest for ${id}: ${err}`)
    }
  }

  private async writeManifest(id: string, manifest: SessionManifest): Promise<void> {
    await this.ensureSessionDir(id)
    await fs.writeFile(this.getManifestPath(id), JSON.stringify(manifest, null, 2), 'utf-8')
  }

  /** 读取 memory.md（压缩摘要）；不存在返回 null */
  async readMemory(id: string): Promise<string | null> {
    try {
      return await fs.readFile(this.getMemoryPath(id), 'utf-8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw ApiError.internal(`Failed to read memory.md for ${id}: ${err}`)
    }
  }

  /** 写入 memory.md */
  async writeMemory(id: string, content: string): Promise<void> {
    await this.ensureSessionDir(id)
    await fs.writeFile(this.getMemoryPath(id), content, 'utf-8')
  }

  // ── 按天 JSONL 读写 ─────────────────────────────────────────

  /** 追加一条 entry 到对应日期的 jsonl 文件 */
  private async appendDatedJsonl(id: string, dateStr: string, entry: JsonlEntry): Promise<void> {
    await this.ensureSessionDir(id)
    const line = JSON.stringify(entry) + '\n'
    await fs.appendFile(this.getDatedJsonlPath(id, dateStr), line, 'utf-8')
  }

  /** 读取指定日期的 jsonl 文件，文件不存在返回空数组 */
  private async readDatedJsonl(id: string, dateStr: string): Promise<JsonlEntry[]> {
    try {
      const raw = await fs.readFile(this.getDatedJsonlPath(id, dateStr), 'utf-8')
      const lines = raw.split('\n').filter(Boolean)
      return lines.map((l) => JSON.parse(l) as JsonlEntry)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw ApiError.internal(`Failed to read ${dateStr}.jsonl for ${id}: ${err}`)
    }
  }

  /** 列出会话目录下所有 jsonl 文件对应的日期，按日期升序 */
  async listDays(id: string): Promise<string[]> {
    const dir = this.getSessionDir(id)
    try {
      const entries = await fs.readdir(dir)
      const days: string[] = []
      for (const name of entries) {
        const m = /^(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name)
        if (m) days.push(m[1]!)
      }
      days.sort()
      return days
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw ApiError.internal(`Failed to list days for ${id}: ${err}`)
    }
  }

  /** 检查会话目录是否存在（用于 listSessions 过滤陈旧 index 条目） */
  private sessionDirExists(id: string): boolean {
    return fsSync.existsSync(this.getSessionDir(id))
  }

  // ── 旧格式迁移 ──────────────────────────────────────────────

  /**
   * 检测并迁移旧 <id>.jsonl 到新目录结构。
   * 切分原文件按 timestamp 的本地日期写入对应 jsonl；写 manifest；删除原文件。
   * 若已是新结构（无旧文件）则无操作。
   */
  private async migrateLegacyIfNeeded(id: string): Promise<void> {
    await this._migrateLegacySession(id, false)
  }

  /**
   * 批量迁移所有旧 <id>.jsonl 文件到新目录结构。
   * 扫描 sessions 目录下所有 *.jsonl 单文件（非目录），逐个调用迁移逻辑。
   * @returns 已迁移的 session ID 列表
   */
  async migrateAllLegacySessions(): Promise<string[]> {
    await this.ensureDirs()
    const migrated: string[] = []
    let entries: fsSync.Dirent[]
    try {
      entries = await fs.readdir(this.sessionsDir, { withFileTypes: true })
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw err
    }
    // 只处理文件（非目录），且名字形如 session-xxx.jsonl
    const legacyFiles = entries.filter(
      (e) => e.isFile() && e.name.endsWith('.jsonl'),
    )
    for (const f of legacyFiles) {
      const id = f.name.replace(/\.jsonl$/, '')
      try {
        const did = await this._migrateLegacySession(id, true)
        if (did) migrated.push(id)
      } catch (err) {
        console.error(`[migrate] failed for ${id}:`, err)
      }
    }
    return migrated
  }

  /**
   * 内部：执行单个 session 的旧 jsonl 迁移。
   * @param standalone true=独立调用（不依赖 readIndex 读取 index 信息，全凭旧文件 meta）
   * @returns 是否真的执行了迁移
   */
  private async _migrateLegacySession(id: string, standalone: boolean): Promise<boolean> {
    const legacyPath = this.getLegacyJsonlPath(id)
    let raw: string
    try {
      raw = await fs.readFile(legacyPath, 'utf-8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw err
    }

    // 旧文件存在，开始迁移
    const lines = raw.split('\n').filter(Boolean)
    const entries: JsonlEntry[] = []
    for (const line of lines) {
      try { entries.push(JSON.parse(line) as JsonlEntry) } catch { /* skip */ }
    }

    const meta = entries.find((e) => e.type === 'session-meta') as (JsonlEntry & { type: 'session-meta' }) | undefined
    if (!meta) {
      // 无 meta 无法迁移，直接删除损坏文件
      await fs.unlink(legacyPath).catch(() => {})
      return false
    }

    await this.ensureSessionDir(id)
    // 按 date 分组写入
    const byDate = new Map<string, JsonlEntry[]>()
    for (const e of entries) {
      if (e.type === 'session-meta') continue
      const d = isoToLocalDate(e.timestamp)
      if (!byDate.has(d)) byDate.set(d, [])
      byDate.get(d)!.push(e)
    }
    for (const [dateStr, es] of byDate) {
      const content = es.map((e) => JSON.stringify(e)).join('\n') + '\n'
      await fs.writeFile(this.getDatedJsonlPath(id, dateStr), content, 'utf-8')
    }

    // 写 manifest（基于旧 meta + index 信息；standalone 模式下 index 也可读到）
    const index = await this.readIndex()
    const indexItem = index.find((s) => s.id === id)
    const manifest: SessionManifest = {
      sessionId: id,
      title: indexItem?.title || meta.title || '新会话',
      workDir: indexItem?.workDir || meta.workDir,
      channel: meta.channel || 'desktop',
      createdAt: meta.createdAt,
      modifiedAt: indexItem?.modifiedAt || meta.timestamp,
      messageCount: indexItem?.messageCount ?? byDate.size, // fallback：按天文件数估算
      compactedThroughDate: null,
    }
    await this.writeManifest(id, manifest)

    // 删除旧文件
    await fs.unlink(legacyPath).catch(() => {})
    console.log(`[session] migrated legacy session ${id}: ${byDate.size} day files`)
    return true
  }

  // ── 条目转换 ────────────────────────────────────────────────

  /** Convert JSONL entries to ChatMessage[] */
  private entriesToMessages(entries: JsonlEntry[]): ChatMessage[] {
    const messages: ChatMessage[] = []
    for (const entry of entries) {
      if (entry.type === 'user') {
        const textBlocks = entry.message.content.filter((c) => c.type === 'text')
        const fullText = textBlocks.map((c) => (c as { type: 'text'; text: string }).text).join('\n')
        if (fullText) {
          messages.push({
            id: entry.uuid,
            role: 'user',
            content: fullText,
            createdAt: entry.timestamp,
          })
        }
      } else if (entry.type === 'assistant') {
        let textContent = ''
        const thinkingContent: string[] = []
        const toolCallList: ChatMessage['toolCalls'] = []
        for (const block of entry.message.content) {
          if (block.type === 'text') {
            textContent += block.text
          } else if (block.type === 'thinking') {
            if (block.thinking) thinkingContent.push(block.thinking)
          } else if (block.type === 'tool_use') {
            toolCallList.push({ id: block.id, toolName: block.name, input: block.input })
          }
        }
        if ((entry as any).toolCalls) {
          for (const tc of (entry as any).toolCalls) {
            if (!toolCallList.some((t) => t.id === tc.id)) {
              toolCallList.push(tc)
            }
          }
        }
        if (textContent || toolCallList.length > 0) {
          messages.push({
            id: entry.uuid,
            role: 'assistant',
            content: textContent,
            createdAt: entry.timestamp,
            ...(thinkingContent.length > 0 ? { thinking: thinkingContent.join('\n') } : {}),
            ...(toolCallList.length > 0 ? { toolCalls: toolCallList } : {}),
          })
        }
      }
    }
    return messages
  }

  /** Find the UUID of the last non-meta message for parentUuid linking */
  private findLastMessageUuid(entries: JsonlEntry[]): string | null {
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i]
      if (e.type === 'user' || e.type === 'assistant') {
        return e.uuid
      }
    }
    return null
  }

  /** 获取最新一天的 entries（用于 findLastMessageUuid 等需要"最近消息"的场景） */
  private async readLatestDayEntries(id: string): Promise<JsonlEntry[]> {
    const days = await this.listDays(id)
    if (days.length === 0) return []
    const latest = days[days.length - 1]!
    return this.readDatedJsonl(id, latest)
  }

  /** 获取指定日期之后（不含该日）所有 jsonl 的 entries，按时间顺序 */
  private async readEntriesAfterDate(id: string, dateStr: string | null): Promise<JsonlEntry[]> {
    const days = await this.listDays(id)
    const filtered = dateStr ? days.filter((d) => d > dateStr) : days
    const all: JsonlEntry[] = []
    for (const d of filtered) {
      const entries = await this.readDatedJsonl(id, d)
      all.push(...entries)
    }
    return all
  }

  /** 获取指定日期及之前所有 jsonl 的 entries（按时间顺序） */
  private async readEntriesThroughDate(id: string, dateStr: string): Promise<JsonlEntry[]> {
    const days = await this.listDays(id)
    const filtered = days.filter((d) => d <= dateStr)
    const all: JsonlEntry[] = []
    for (const d of filtered) {
      const entries = await this.readDatedJsonl(id, d)
      all.push(...entries)
    }
    return all
  }

  // ── Public API ───────────────────────────────────────────────

  async listSessions(): Promise<{ sessions: SessionListItem[]; total: number }> {
    const index = await this.readIndex()
    // 兼容判断：旧条目可能对应 <id>.jsonl（旧格式）或 <id>/（新格式）
    const valid = index.filter((s) => this.sessionDirExists(s.id) || fsSync.existsSync(this.getLegacyJsonlPath(s.id)))
    if (valid.length !== index.length) {
      await this.writeIndex(valid)
    }
    valid.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    return { sessions: valid, total: valid.length }
  }

  async getSession(id: string): Promise<SessionDetail> {
    await this.migrateLegacyIfNeeded(id)
    const manifest = await this.readManifest(id)
    if (!manifest) throw ApiError.notFound(`Session not found: ${id}`)
    // 加载最近一天的消息用于详情页预览（避免大 session 一次性加载全部）
    const days = await this.listDays(id)
    const messages: ChatMessage[] = days.length > 0
      ? this.entriesToMessages(await this.readDatedJsonl(id, days[days.length - 1]!))
      : []
    return {
      id,
      title: manifest.title,
      createdAt: manifest.createdAt,
      modifiedAt: manifest.modifiedAt,
      messageCount: manifest.messageCount,
      workDir: manifest.workDir,
      messages,
    }
  }

  async createSession(input: CreateSessionInput): Promise<SessionDetail> {
    const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const now = this.now()
    await this.ensureSessionDir(id)

    const manifest: SessionManifest = {
      sessionId: id,
      title: input.title || '新会话',
      workDir: input.workDir || undefined,
      channel: 'desktop',
      createdAt: now,
      modifiedAt: now,
      messageCount: 0,
      compactedThroughDate: null,
    }
    await this.writeManifest(id, manifest)

    const index = await this.readIndex()
    const listItem: SessionListItem = {
      id,
      title: manifest.title,
      createdAt: now,
      modifiedAt: now,
      messageCount: 0,
      workDir: input.workDir,
    }
    index.push(listItem)
    await this.writeIndex(index)

    return {
      id,
      title: manifest.title,
      createdAt: now,
      modifiedAt: now,
      messageCount: 0,
      workDir: input.workDir,
      messages: [],
    }
  }

  async deleteSession(id: string): Promise<void> {
    const index = await this.readIndex()
    const idx = index.findIndex((s) => s.id === id)
    if (idx === -1) throw ApiError.notFound(`Session not found: ${id}`)
    index.splice(idx, 1)
    await this.writeIndex(index)

    // 删除整个会话目录
    try {
      await fs.rm(this.getSessionDir(id), { recursive: true, force: true })
    } catch {
      // ignore
    }
    // 兼容：也可能存在旧 jsonl 文件
    await fs.unlink(this.getLegacyJsonlPath(id)).catch(() => {})
  }

  async renameSession(id: string, title: string): Promise<void> {
    await this.migrateLegacyIfNeeded(id)
    const manifest = await this.readManifest(id)
    if (!manifest) throw ApiError.notFound(`Session not found: ${id}`)
    manifest.title = title
    manifest.modifiedAt = this.now()
    await this.writeManifest(id, manifest)

    const index = await this.readIndex()
    const item = index.find((s) => s.id === id)
    if (item) {
      item.title = title
      item.modifiedAt = manifest.modifiedAt
      await this.writeIndex(index)
    }
  }

  async updateWorkDir(id: string, workDir: string): Promise<void> {
    await this.migrateLegacyIfNeeded(id)
    const manifest = await this.readManifest(id)
    if (!manifest) throw ApiError.notFound(`Session not found: ${id}`)
    manifest.workDir = workDir
    manifest.modifiedAt = this.now()
    await this.writeManifest(id, manifest)

    const index = await this.readIndex()
    const item = index.find((s) => s.id === id)
    if (item) {
      item.workDir = workDir
      item.modifiedAt = manifest.modifiedAt
      await this.writeIndex(index)
    }
  }

  async addMessage(
    id: string,
    role: 'user' | 'assistant',
    content: string,
    thinking?: string,
    toolCalls?: Array<{ id: string; toolName: string; input: Record<string, unknown>; result?: string; isError?: boolean }>,
  ): Promise<ChatMessage> {
    await this.migrateLegacyIfNeeded(id)
    const manifest = await this.readManifest(id)
    if (!manifest) throw ApiError.notFound(`Session not found: ${id}`)

    const now = this.now()
    const dateStr = isoToLocalDate(now)
    const latestEntries = await this.readLatestDayEntries(id)
    const parentUuid = this.findLastMessageUuid(latestEntries)
    const messageId = this.uuid()

    if (role === 'user') {
      const userEntry: JsonlEntry & { type: 'user' } = {
        type: 'user',
        uuid: messageId,
        parentUuid,
        timestamp: now,
        message: { role: 'user', content: [{ type: 'text', text: content }] },
        sessionId: id,
        version: '0.1.0',
      }
      // 首条用户消息自动设标题（必须在 append 之前判断，否则会把刚追加的也算进去）
      const allEntriesBeforeAppend = await this.readEntriesAfterDate(id, manifest.compactedThroughDate)
      const existingMessages = this.entriesToMessages(allEntriesBeforeAppend)
      if (existingMessages.length === 0) {
        manifest.title = content.slice(0, 30) + (content.length > 30 ? '...' : '')
      }
      await this.appendDatedJsonl(id, dateStr, userEntry)
    } else {
      const contentBlocks: JsonlEntry['message']['content'] = []
      if (thinking) contentBlocks.push({ type: 'thinking', thinking, signature: '' })
      if (content) contentBlocks.push({ type: 'text', text: content })

      const assistantEntry: JsonlEntry & { type: 'assistant' } = {
        type: 'assistant',
        uuid: messageId,
        parentUuid,
        timestamp: now,
        message: { role: 'assistant', content: contentBlocks, model: undefined },
        sessionId: id,
        version: '0.1.0',
        ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
      }
      await this.appendDatedJsonl(id, dateStr, assistantEntry)
    }

    // 更新 manifest 与 index
    manifest.messageCount += 1
    manifest.modifiedAt = now
    await this.writeManifest(id, manifest)

    const index = await this.readIndex()
    const item = index.find((s) => s.id === id)
    if (item) {
      item.messageCount = manifest.messageCount
      item.modifiedAt = now
      item.title = manifest.title
      await this.writeIndex(index)
    }

    return {
      id: messageId,
      role,
      content,
      createdAt: now,
      ...(thinking ? { thinking } : {}),
      ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
    }
  }

  /**
   * 获取全部消息（用于 LLM 上下文）。
   * 注意：会先读 memory.md 作为开头 user summary 消息，再读 compactedThroughDate 之后的所有 jsonl。
   * 不读已压缩日期及之前的内容。
   */
  async getMessages(id: string): Promise<ChatMessage[]> {
    await this.migrateLegacyIfNeeded(id)
    const manifest = await this.readManifest(id)
    if (!manifest) throw ApiError.notFound(`Session not found: ${id}`)

    const messages: ChatMessage[] = []

    // 1) memory.md 摘要作为开头（若有）
    const memory = await this.readMemory(id)
    if (memory && memory.trim()) {
      messages.push({
        id: 'memory-summary',
        role: 'user',
        content: `[以下是此前对话的压缩摘要，供你延续上下文]\n\n${memory}`,
        createdAt: manifest.compactedThroughDate
          ? new Date(manifest.compactedThroughDate + 'T23:59:59').toISOString()
          : manifest.createdAt,
      })
    }

    // 2) compactedThroughDate 之后的所有消息
    const entries = await this.readEntriesAfterDate(id, manifest.compactedThroughDate)
    messages.push(...this.entriesToMessages(entries))

    return messages
  }

  /**
   * 按天分页加载消息（前端用）。
   * 不传 date：返回最新一天的消息。
   * 传 date：返回该日的消息。
   * 返回值含日期列表（用于前端"加载更多前一天"）。
   */
  async getMessagesByDay(
    id: string,
    date?: string,
  ): Promise<{ messages: ChatMessage[]; days: string[]; requestedDay: string | null; hasMore: boolean }> {
    await this.migrateLegacyIfNeeded(id)
    const manifest = await this.readManifest(id)
    if (!manifest) throw ApiError.notFound(`Session not found: ${id}`)

    const days = await this.listDays(id)
    // 跳过已压缩到 memory.md 的日期（前端不应直接展示原始已压缩消息）
    const visibleDays = manifest.compactedThroughDate
      ? days.filter((d) => d > manifest.compactedThroughDate)
      : days

    if (visibleDays.length === 0) {
      return { messages: [], days: visibleDays, requestedDay: null, hasMore: false }
    }

    let targetDay: string
    if (date && visibleDays.includes(date)) {
      targetDay = date
    } else {
      targetDay = visibleDays[visibleDays.length - 1]!
    }

    const entries = await this.readDatedJsonl(id, targetDay)
    const messages = this.entriesToMessages(entries)
    const idx = visibleDays.indexOf(targetDay)
    const hasMore = idx > 0

    return { messages, days: visibleDays, requestedDay: targetDay, hasMore }
  }

  /** Clear all messages: 删除所有 jsonl + memory.md + 重置 manifest */
  async clearMessages(id: string): Promise<void> {
    await this.migrateLegacyIfNeeded(id)
    const manifest = await this.readManifest(id)
    if (!manifest) throw ApiError.notFound(`Session not found: ${id}`)

    const dir = this.getSessionDir(id)
    const entries = await fs.readdir(dir).catch(() => [])
    for (const name of entries) {
      if (name.endsWith('.jsonl') || name === 'memory.md') {
        await fs.unlink(path.join(dir, name)).catch(() => {})
      }
    }

    const now = this.now()
    manifest.messageCount = 0
    manifest.modifiedAt = now
    manifest.compactedThroughDate = null
    await this.writeManifest(id, manifest)

    const index = await this.readIndex()
    const item = index.find((s) => s.id === id)
    if (item) {
      item.messageCount = 0
      item.modifiedAt = now
      await this.writeIndex(index)
    }
  }

  // ── 压缩协作接口（供 compactService 调用） ─────────────────

  /** 获取 manifest（compactService 用） */
  async getManifest(id: string): Promise<SessionManifest | null> {
    await this.migrateLegacyIfNeeded(id)
    return this.readManifest(id)
  }

  /** 更新 manifest（compactService 用，仅更新 compactedThroughDate 等字段） */
  async updateManifest(id: string, patch: Partial<SessionManifest>): Promise<void> {
    const manifest = await this.readManifest(id)
    if (!manifest) throw ApiError.notFound(`Session not found: ${id}`)
    const updated = { ...manifest, ...patch }
    await this.writeManifest(id, updated)
  }

  /** 读取指定日期及之前的所有 entries（compactService 用，用于按天压缩） */
  async getEntriesThroughDate(id: string, dateStr: string): Promise<JsonlEntry[]> {
    await this.migrateLegacyIfNeeded(id)
    return this.readEntriesThroughDate(id, dateStr)
  }

  /** 读取指定日期之后的所有 entries（compactService 用，用于压缩后剩余上下文） */
  async getEntriesAfterDate(id: string, dateStr: string | null): Promise<JsonlEntry[]> {
    await this.migrateLegacyIfNeeded(id)
    return this.readEntriesAfterDate(id, dateStr)
  }
}

export const sessionService = new SessionService()
