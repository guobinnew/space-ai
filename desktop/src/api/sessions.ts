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

  create(input: { workDir?: string; title?: string }) {
    return api.post<SessionDetail>('/api/sessions', input)
  },

  delete(id: string) {
    return api.delete<{ ok: true }>(`/api/sessions/${encodeURIComponent(id)}`)
  },

  rename(id: string, title: string) {
    return api.patch<{ ok: true }>(`/api/sessions/${encodeURIComponent(id)}`, { title })
  },

  addMessage(id: string, role: 'user' | 'assistant', content: string) {
    return api.post<MessageResponse>(
      `/api/sessions/${encodeURIComponent(id)}/messages`,
      { role, content },
    )
  },
}
