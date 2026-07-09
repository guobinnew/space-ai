/**
 * Filesystem API client — 文件系统浏览
 *
 * GET /api/filesystem/list?path=xxx  — 列出目录内容
 * GET /api/filesystem/read?path=xxx  — 读取文件内容(带行号)
 */

import { api } from './client'

export interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modifiedAt: string
}

export interface FileContent {
  content: string
  path: string
  totalLines: number
  offset: number
  limit: number
  truncated: boolean
}

export const filesystemApi = {
  list(dirPath: string) {
    return api.get<{ entries: DirEntry[]; path: string }>(
      `/api/filesystem/list?path=${encodeURIComponent(dirPath)}`,
    )
  },

  read(filePath: string, offset?: number, limit?: number) {
    const params = new URLSearchParams({ path: filePath })
    if (offset !== undefined) params.set('offset', String(offset))
    if (limit !== undefined) params.set('limit', String(limit))
    return api.get<FileContent>(`/api/filesystem/read?${params.toString()}`)
  },
}
