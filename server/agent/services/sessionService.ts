/**
 * Session Service — 会话管理
 *
 * 参照 smart-code services/sessionService.ts 复刻，简化版。
 * Storage: ~/.spaceai/sessions/<id>.json (每个会话一个文件)
 *          ~/.spaceai/sessions/index.json (会话索引)
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { ApiError } from '../middleware/errorHandler'
import type { SessionListItem, SessionDetail, ChatMessage, CreateSessionInput } from '../types/session'

export class SessionService {
  private getConfigDir(): string {
    return process.env.SPACEAI_CONFIG_DIR || path.join(os.homedir(), '.spaceai')
  }

  private getSessionsDir(): string {
    return path.join(this.getConfigDir(), 'sessions')
  }

  private getIndexPath(): string {
    return path.join(this.getSessionsDir(), 'index.json')
  }

  private getSessionFilePath(id: string): string {
    return path.join(this.getSessionsDir(), `${id}.json`)
  }

  private async ensureDirs(): Promise<void> {
    await fs.mkdir(this.getSessionsDir(), { recursive: true })
  }

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

  private async readSessionFile(id: string): Promise<SessionDetail | null> {
    try {
      const raw = await fs.readFile(this.getSessionFilePath(id), 'utf-8')
      return JSON.parse(raw) as SessionDetail
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw ApiError.internal(`Failed to read session ${id}: ${err}`)
    }
  }

  private async writeSessionFile(session: SessionDetail): Promise<void> {
    await this.ensureDirs()
    await fs.writeFile(this.getSessionFilePath(session.id), JSON.stringify(session, null, 2), 'utf-8')
  }

  async listSessions(): Promise<{ sessions: SessionListItem[]; total: number }> {
    const sessions = await this.readIndex()
    sessions.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    return { sessions, total: sessions.length }
  }

  async getSession(id: string): Promise<SessionDetail> {
    const session = await this.readSessionFile(id)
    if (!session) throw ApiError.notFound(`Session not found: ${id}`)
    return session
  }

  async createSession(input: CreateSessionInput): Promise<SessionDetail> {
    const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const now = new Date().toISOString()

    const session: SessionDetail = {
      id,
      title: input.title || '新会话',
      createdAt: now,
      modifiedAt: now,
      messageCount: 0,
      workDir: input.workDir,
      messages: [],
    }

    await this.writeSessionFile(session)

    // Update index
    const index = await this.readIndex()
    const listItem: SessionListItem = {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      modifiedAt: session.modifiedAt,
      messageCount: session.messageCount,
      workDir: session.workDir,
    }
    index.push(listItem)
    await this.writeIndex(index)

    return session
  }

  async deleteSession(id: string): Promise<void> {
    const index = await this.readIndex()
    const idx = index.findIndex((s) => s.id === id)
    if (idx === -1) throw ApiError.notFound(`Session not found: ${id}`)

    index.splice(idx, 1)
    await this.writeIndex(index)

    // Delete session file
    try {
      await fs.unlink(this.getSessionFilePath(id))
    } catch {
      // File may not exist, ignore
    }
  }

  async renameSession(id: string, title: string): Promise<void> {
    const session = await this.readSessionFile(id)
    if (!session) throw ApiError.notFound(`Session not found: ${id}`)

    session.title = title
    session.modifiedAt = new Date().toISOString()
    await this.writeSessionFile(session)

    // Update index
    const index = await this.readIndex()
    const item = index.find((s) => s.id === id)
    if (item) {
      item.title = title
      item.modifiedAt = session.modifiedAt
      await this.writeIndex(index)
    }
  }

  async updateWorkDir(id: string, workDir: string): Promise<void> {
    const session = await this.readSessionFile(id)
    if (!session) throw ApiError.notFound(`Session not found: ${id}`)

    session.workDir = workDir
    session.modifiedAt = new Date().toISOString()
    await this.writeSessionFile(session)

    // Update index
    const index = await this.readIndex()
    const item = index.find((s) => s.id === id)
    if (item) {
      item.workDir = workDir
      item.modifiedAt = session.modifiedAt
      await this.writeIndex(index)
    }
  }

  async addMessage(id: string, role: 'user' | 'assistant', content: string): Promise<ChatMessage> {
    const session = await this.readSessionFile(id)
    if (!session) throw ApiError.notFound(`Session not found: ${id}`)

    const message: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role,
      content,
      createdAt: new Date().toISOString(),
    }

    session.messages.push(message)
    session.messageCount = session.messages.length
    session.modifiedAt = message.createdAt

    // Auto-title from first user message
    if (role === 'user' && (session.title === '新会话' || !session.title)) {
      session.title = content.slice(0, 30) + (content.length > 30 ? '...' : '')
    }

    await this.writeSessionFile(session)

    // Update index
    const index = await this.readIndex()
    const item = index.find((s) => s.id === id)
    if (item) {
      item.title = session.title
      item.messageCount = session.messageCount
      item.modifiedAt = session.modifiedAt
      await this.writeIndex(index)
    }

    return message
  }

  async getMessages(id: string): Promise<ChatMessage[]> {
    const session = await this.readSessionFile(id)
    if (!session) throw ApiError.notFound(`Session not found: ${id}`)
    return session.messages
  }
}

export const sessionService = new SessionService()
