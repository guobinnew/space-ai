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
  /** 磁盘上的实际目录名（可能与 name 不同） */
  dirName?: string
}

/** 技能文件树节点 */
type SkillFileNode = {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  language?: string
  children?: SkillFileNode[]
}

/** 技能文件条目（扁平化） */
type SkillFileEntry = {
  path: string
  name: string
  size: number
  language: string
}

/** 技能完整详情（含文件树） */
type SkillFullDetail = {
  meta: SkillMeta & { basePath: string; dirName?: string }
  tree: SkillFileNode[]
  files: SkillFileEntry[]
  skillRoot: string
}

/** 技能文件内容 */
type SkillFileContent = {
  content: string
  language: string
}

export const skillsApi = {
  list() {
    return api.get<{ skills: SkillMeta[] }>('/api/skills')
  },
  get(name: string) {
    return api.get<{ skill: SkillMeta & { content: string } }>(`/api/skills/${encodeURIComponent(name)}`)
  },
  detail(name: string) {
    return api.get<SkillFullDetail>(`/api/skills/${encodeURIComponent(name)}/detail`)
  },
  file(name: string, filePath: string) {
    return api.get<SkillFileContent>(
      `/api/skills/${encodeURIComponent(name)}/file?path=${encodeURIComponent(filePath)}`
    )
  },
  import(filePath: string, force?: boolean) {
    return api.post<{ success: boolean; message: string }>('/api/skills/import', { filePath, force })
  },
}

// --- Computer Use ---

type ComputerUseStatus = {
  platform: string
  supported: boolean
  python: {
    installed: boolean
    version: string | null
    path: string | null
  }
  venv: {
    created: boolean
    path: string
  }
  dependencies: {
    installed: boolean
    requirementsFound: boolean
  }
  permissions: {
    accessibility: boolean | null
    screenRecording: boolean | null
  }
}

type SetupStep = {
  name: string
  ok: boolean
  message: string
}

type SetupResult = {
  success: boolean
  steps: SetupStep[]
}

type InstalledApp = {
  bundleId: string
  displayName: string
  path: string
}

type AuthorizedApp = {
  bundleId: string
  displayName: string
  authorizedAt: string
}

type ComputerUseConfig = {
  authorizedApps: AuthorizedApp[]
  grantFlags: {
    clipboardRead: boolean
    clipboardWrite: boolean
    systemKeyCombos: boolean
  }
}

export const computerUseApi = {
  getStatus() {
    return api.get<ComputerUseStatus>('/api/computer-use/status')
  },
  runSetup() {
    return api.post<SetupResult>('/api/computer-use/setup')
  },
  getInstalledApps() {
    return api.get<{ apps: InstalledApp[] }>('/api/computer-use/apps')
  },
  getAuthorizedApps() {
    return api.get<ComputerUseConfig>('/api/computer-use/authorized-apps')
  },
  setAuthorizedApps(config: Partial<ComputerUseConfig>) {
    return api.put<{ ok: true }>('/api/computer-use/authorized-apps', config)
  },
  openSettings(pane: 'Privacy_ScreenCapture' | 'Privacy_Accessibility') {
    return api.post<{ ok: true }>('/api/computer-use/open-settings', { pane })
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

export type { SkillMeta, SkillFileNode, SkillFileEntry, SkillFullDetail, SkillFileContent, ComputerUseStatus, SetupStep, SetupResult, InstalledApp, AuthorizedApp, ComputerUseConfig, MemoryEntry, MemoryStats }
