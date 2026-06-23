/**
 * Skills/ComputerUse/Memory API client
 */

import { api } from './client'

// --- Skills ---

type SkillMeta = {
  name: string
  description: string
  source: 'builtin' | 'user' | 'project'
  userInvocable: boolean
  tokenEstimate?: number
}

export const skillsApi = {
  list() {
    return api.get<{ skills: SkillMeta[] }>('/api/skills')
  },
  get(name: string) {
    return api.get<{ skill: SkillMeta & { content: string } }>(`/api/skills/${encodeURIComponent(name)}`)
  },
  import(filePath: string, force?: boolean) {
    return api.post<{ success: boolean; message: string }>('/api/skills/import', { filePath, force })
  },
}

// --- Computer Use ---

type ComputerUseStatus = {
  available: boolean
  platform: string
  pythonAvailable: boolean
  setupCompleted: boolean
}

export const computerUseApi = {
  status() {
    return api.get<ComputerUseStatus>('/api/computer-use/status')
  },
  setup() {
    return api.post<{ success: boolean; message: string }>('/api/computer-use/setup')
  },
}

// --- Memory ---

type MemoryEntry = {
  id: string
  title: string
  content: string
  category: string
  createdAt: string
  updatedAt: string
}

type MemoryStats = {
  totalEntries: number
  totalSize: number
  categories: string[]
}

export const memoryApi = {
  list() {
    return api.get<{ entries: MemoryEntry[]; stats: MemoryStats }>('/api/memory')
  },
  create(input: { title: string; content: string; category?: string }) {
    return api.post<{ entry: MemoryEntry }>('/api/memory', input)
  },
  update(id: string, input: Partial<MemoryEntry>) {
    return api.put<{ entry: MemoryEntry }>(`/api/memory/${encodeURIComponent(id)}`, input)
  },
  delete(id: string) {
    return api.delete<{ ok: true }>(`/api/memory/${encodeURIComponent(id)}`)
  },
}

export type { SkillMeta, ComputerUseStatus, MemoryEntry, MemoryStats }
