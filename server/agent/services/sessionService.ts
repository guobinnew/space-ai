/**
 * Session Service — 会话管理 (JSONL 格式)
 *
 * Storage: ~/.spaceai/sessions/<id>.jsonl  (每个会话一个 JSONL 文件)
 *          ~/.spaceai/sessions/index.json   (会话索引)
 *
 * JSONL 格式参考 Claude CLI: 每行一个 JSON 对象，支持以下类型:
 *   session-meta — 会话元数据
 *   user         — 用户消息
 *   assistant    — 助手消息（含 thinking/text/tool_use content blocks）
 */

import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import * as os from 'os'
import { ApiError } from '../middleware/errorHandler'
import type { SessionListItem, SessionDetail, ChatMessage, CreateSessionInput } from '../types/session'

/** JSONL 条目类型 */
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
      { type: 'thinking'; thinking: string; signature: string }
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

export class SessionService {
  private configDir: string
  private sessionsDir: string

  constructor() {
    this.configDir = process.env.SPACEAI_CONFIG_DIR || path.join(os.homedir(), '.spaceai')
    this.sessionsDir = path.join(this.configDir, 'sessions')
  }

  // ── Path helpers ─────────────────────────────────────────────

  private getIndexPath(): string {
    return path.join(this.sessionsDir, 'index.json')
  }

  private getJsonlPath(id: string): string {
    return path.join(this.sessionsDir, `${id}.jsonl`)
  }

  private async ensureDirs(): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true })
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

  // ── JSONL read / write ───────────────────────────────────────

  /** Append a single JSONL entry to the session file */
  private async appendJsonl(id: string, entry: JsonlEntry): Promise<void> {
    await this.ensureDirs()
    const line = JSON.stringify(entry) + '\n'
    await fs.appendFile(this.getJsonlPath(id), line, 'utf-8')
  }

  /** Read all JSONL entries from a session file */
  private async readJsonl(id: string): Promise<JsonlEntry[]> {
    try {
      const raw = await fs.readFile(this.getJsonlPath(id), 'utf-8')
      const lines = raw.split('\n').filter(Boolean)
      return lines.map((l) => JSON.parse(l) as JsonlEntry)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw ApiError.internal(`Failed to read session ${id}: ${err}`)
    }
  }

  /** Check if a JSONL file exists */
  private jsonlExists(id: string): boolean {
    return fsSync.existsSync(this.getJsonlPath(id))
  }

  /** Get the last message timestamp from the JSONL file for modifiedAt */
  private getLastTimestamp(entries: JsonlEntry[]): string {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i]!.type !== 'session-meta') {
        return entries[i]!.timestamp
      }
    }
    // Fall back to session-meta timestamp
    const meta = entries.find((e) => e.type === 'session-meta')
    return meta ? meta.timestamp : this.now()
  }

  /** Convert JSONL entries to ChatMessage[] */
  private entriesToMessages(entries: JsonlEntry[]): ChatMessage[] {
    const messages: ChatMessage[] = []
    for (const entry of entries) {
      if (entry.type === 'user') {
        // Extract text content from user messages
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
        // Extract text and thinking from assistant messages
        let textContent = ''
        const thinkingContent: string[] = []
        for (const block of entry.message.content) {
          if (block.type === 'text') {
            textContent += block.text
          } else if (block.type === 'thinking') {
            if (block.thinking) thinkingContent.push(block.thinking)
          }
          // tool_use blocks are not included in ChatMessage content
        }
        if (textContent) {
          messages.push({
            id: entry.uuid,
            role: 'assistant',
            content: textContent,
            createdAt: entry.timestamp,
            ...(thinkingContent.length > 0 ? { thinking: thinkingContent.join('\n') } : {}),
          })
        }
      }
    }
    return messages
  }

  /** Build session detail from JSONL entries + index */
  private entriesToSessionDetail(id: string, entries: JsonlEntry[], indexItem?: SessionListItem): SessionDetail {
    const meta = entries.find((e) => e.type === 'session-meta') as JsonlEntry & { type: 'session-meta' } | undefined
    const messages = this.entriesToMessages(entries)
    const lastTimestamp = this.getLastTimestamp(entries)

    return {
      id,
      title: indexItem?.title || meta?.title || '新会话',
      createdAt: meta?.createdAt || lastTimestamp,
      modifiedAt: indexItem?.modifiedAt || lastTimestamp,
      messageCount: messages.length,
      workDir: meta?.workDir || indexItem?.workDir,
      messages,
    }
  }

  // ── Public API ───────────────────────────────────────────────

  async listSessions(): Promise<{ sessions: SessionListItem[]; total: number }> {
    const index = await this.readIndex()
    // Remove stale index entries (no matching JSONL file)
    const valid = index.filter((s) => this.jsonlExists(s.id))
    if (valid.length !== index.length) {
      await this.writeIndex(valid)
    }
    valid.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    return { sessions: valid, total: valid.length }
  }

  async getSession(id: string): Promise<SessionDetail> {
    const entries = await this.readJsonl(id)
    if (entries.length === 0) throw ApiError.notFound(`Session not found: ${id}`)

    const index = await this.readIndex()
    const indexItem = index.find((s) => s.id === id)
    return this.entriesToSessionDetail(id, entries, indexItem)
  }

  async createSession(input: CreateSessionInput): Promise<SessionDetail> {
    const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const now = this.now()

    // Write session-meta line
    const metaEntry: JsonlEntry & { type: 'session-meta' } = {
      type: 'session-meta',
      sessionId: id,
      title: input.title || '新会话',
      workDir: input.workDir || undefined,
      channel: 'desktop',
      createdAt: now,
      timestamp: now,
    }
    await this.appendJsonl(id, metaEntry)

    // Update index
    const index = await this.readIndex()
    const listItem: SessionListItem = {
      id,
      title: metaEntry.title || '新会话',
      createdAt: now,
      modifiedAt: now,
      messageCount: 0,
      workDir: input.workDir,
    }
    index.push(listItem)
    await this.writeIndex(index)

    return {
      id,
      title: listItem.title,
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

    // Delete JSONL file
    try {
      await fs.unlink(this.getJsonlPath(id))
    } catch {
      // File may not exist, ignore
    }
  }

  async renameSession(id: string, title: string): Promise<void> {
    // Update index
    const index = await this.readIndex()
    const item = index.find((s) => s.id === id)
    if (!item) throw ApiError.notFound(`Session not found: ${id}`)

    item.title = title
    item.modifiedAt = this.now()
    await this.writeIndex(index)
  }

  async updateWorkDir(id: string, workDir: string): Promise<void> {
    const index = await this.readIndex()
    const item = index.find((s) => s.id === id)
    if (!item) throw ApiError.notFound(`Session not found: ${id}`)

    item.workDir = workDir
    item.modifiedAt = this.now()
    await this.writeIndex(index)
  }

  async addMessage(
    id: string,
    role: 'user' | 'assistant',
    content: string,
    thinking?: string,
  ): Promise<ChatMessage> {
    const entries = await this.readJsonl(id)
    if (entries.length === 0) throw ApiError.notFound(`Session not found: ${id}`)

    const now = this.now()
    const meta = entries.find((e) => e.type === 'session-meta')
    const parentUuid = this.findLastMessageUuid(entries)

    const messageId = this.uuid()

    if (role === 'user') {
      const userEntry: JsonlEntry & { type: 'user' } = {
        type: 'user',
        uuid: messageId,
        parentUuid,
        timestamp: now,
        message: {
          role: 'user',
          content: [{ type: 'text', text: content }],
        },
        sessionId: id,
        version: '0.1.0',
      }
      await this.appendJsonl(id, userEntry)

      // Auto-title from first user message
      if (meta) {
        const existingMessages = this.entriesToMessages(entries)
        if (existingMessages.length === 0 || !entries.some((e) => e.type !== 'session-meta' && e.type !== 'queue-operation')) {
          const title = content.slice(0, 30) + (content.length > 30 ? '...' : '')
          const index = await this.readIndex()
          const item = index.find((s) => s.id === id)
          if (item) {
            item.title = title
            await this.writeIndex(index)
          }
        }
      }
    } else {
      // Build content blocks: thinking first, then text
      const contentBlocks: JsonlEntry['message']['content'] = []
      if (thinking) {
        contentBlocks.push({ type: 'thinking', thinking, signature: '' })
      }
      if (content) {
        contentBlocks.push({ type: 'text', text: content })
      }

      const assistantEntry: JsonlEntry & { type: 'assistant' } = {
        type: 'assistant',
        uuid: messageId,
        parentUuid,
        timestamp: now,
        message: {
          role: 'assistant',
          content: contentBlocks,
          model: undefined,
        },
        sessionId: id,
        version: '0.1.0',
      }
      await this.appendJsonl(id, assistantEntry)
    }

    // Update index
    const index = await this.readIndex()
    const item = index.find((s) => s.id === id)
    if (item) {
      // Re-count messages from JSONL
      const allEntries = await this.readJsonl(id)
      const msgCount = this.entriesToMessages(allEntries).length
      item.messageCount = msgCount
      item.modifiedAt = now
      await this.writeIndex(index)
    }

    return {
      id: messageId,
      role,
      content,
      createdAt: now,
      ...(thinking ? { thinking } : {}),
    }
  }

  async getMessages(id: string): Promise<ChatMessage[]> {
    const entries = await this.readJsonl(id)
    if (entries.length === 0) throw ApiError.notFound(`Session not found: ${id}`)
    return this.entriesToMessages(entries)
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

  /** Clear all messages from JSONL, keeping only the session-meta line */
  async clearMessages(id: string): Promise<void> {
    const entries = await this.readJsonl(id)
    if (entries.length === 0) throw ApiError.notFound(`Session not found: ${id}`)

    const meta = entries.find((e) => e.type === 'session-meta')
    if (!meta) throw ApiError.internal('Session meta not found')

    // Rewrite JSONL with only the meta line + update timestamp
    await this.ensureDirs()
    const now = this.now()
    const cleanMeta = { ...meta, timestamp: now }
    await fs.writeFile(this.getJsonlPath(id), JSON.stringify(cleanMeta) + '\n', 'utf-8')

    // Update index
    const index = await this.readIndex()
    const item = index.find((s) => s.id === id)
    if (item) {
      item.messageCount = 0
      item.modifiedAt = now
      await this.writeIndex(index)
    }
  }
}

export const sessionService = new SessionService()
