/**
 * Git API client — git 状态和 diff
 *
 * 参照 smart-code api/git.ts 照搬。
 */

import { api } from './client'

export type GitFileStatus = 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed' | 'copied' | 'staged' | 'staged-modified'

export type GitStatusEntry = {
  path: string
  statusCode: string
  status: GitFileStatus
}

export type GitStatusResult = {
  files: GitStatusEntry[]
  branch: string | null
  isGitRepo: boolean
}

export type GitDiffResult = {
  diff: string
  stagedDiff: string
  isGitRepo: boolean
}

export const gitApi = {
  getStatus(workDir: string) {
    const q = new URLSearchParams({ path: workDir })
    return api.get<GitStatusResult>(`/api/git/status?${q}`)
  },

  getDiff(workDir: string, filePath: string) {
    const q = new URLSearchParams({ path: workDir, file: filePath })
    return api.get<GitDiffResult>(`/api/git/diff?${q}`)
  },
}
