/**
 * Sessions API client
 *
 * 参照 smart-code api/sessions.ts 复刻。
 */

import { api } from './client'
import type { SessionListItem, SessionDetail, ChatMessage } from '../types/session'

type ListResponse = { sessions: SessionListItem[]; total: number }
type MessagesResponse = { messages: ChatMessage[] }
type MessageResponse = { message: ChatMessage }
type MessagesByDayResponse = {
  messages: ChatMessage[]
  days: string[]
  requestedDay: string | null
  hasMore: boolean
}

export const sessionsApi = {
  list() {
    return api.get<ListResponse>('/api/sessions')
  },

  get(id: string) {
    return api.get<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`)
  },

  getMessages(id: string) {
    return api.get<MessagesResponse>(`/api/sessions/${encodeURIComponent(id)}/messages`)
  },

  /**
   * 按天分页加载消息。不传 date 返回最新一天；传 date 返回该日。
   */
  getMessagesByDay(id: string, date?: string) {
    const q = date ? `?date=${encodeURIComponent(date)}` : ''
    return api.get<MessagesByDayResponse>(
      `/api/sessions/${encodeURIComponent(id)}/messages${q}`,
    )
  },

  create(input: { workDir?: string; title?: string }) {
    return api.post<SessionDetail>('/api/sessions', input)
  },

  delete(id: string) {
    return api.delete<{ ok: true }>(`/api/sessions/${encodeURIComponent(id)}`)
  },

  rename(id: string, title: string) {
    return api.patch<{ ok: true }>(`/api/sessions/${encodeURIComponent(id)}`, { title })
  },

  updateWorkDir(id: string, workDir: string) {
    return api.patch<{ ok: true }>(`/api/sessions/${encodeURIComponent(id)}`, { workDir })
  },

  addMessage(id: string, role: 'user' | 'assistant', content: string) {
    return api.post<MessageResponse>(
      `/api/sessions/${encodeURIComponent(id)}/messages`,
      { role, content },
    )
  },

  clearMessages(id: string) {
    return api.delete<{ ok: true }>(`/api/sessions/${encodeURIComponent(id)}/messages`)
  },
}
