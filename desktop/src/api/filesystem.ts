/**
 * Filesystem API client — 文件系统浏览、读写、删除、移动
 *
 * 参照 smart-code api/filesystem.ts 照搬。
 */

import { api, getBaseUrl } from './client'

export type DirEntry = {
  name: string
  path: string
  isDirectory: boolean
}

export type BrowseResult = {
  currentPath: string
  parentPath: string
  entries: DirEntry[]
  query?: string
}

export type ReadFileResult = {
  content: string
  path: string
  size: number
}

export type WriteFileResult = {
  success: boolean
  path: string
}

export type DeleteResult = {
  success: boolean
  path: string
}

export const MAX_PREVIEW_SIZE = 20 * 1024 * 1024 // 20MB

export const filesystemApi = {
  browse(path?: string, options?: { includeFiles?: boolean }) {
    const q = new URLSearchParams()
    if (path) q.set('path', path)
    if (options?.includeFiles) q.set('includeFiles', 'true')
    const qs = q.toString()
    return api.get<BrowseResult>(`/api/filesystem/browse${qs ? `?${qs}` : ''}`)
  },

  search(query: string, cwd?: string) {
    const q = new URLSearchParams({ search: query, maxResults: '200' })
    if (cwd) q.set('path', cwd)
    return api.get<BrowseResult>(`/api/filesystem/browse?${q}`)
  },

  readFile(filePath: string) {
    const q = new URLSearchParams({ path: filePath })
    return api.get<ReadFileResult>(`/api/filesystem/read?${q}`)
  },

  writeFile(filePath: string, content: string) {
    const q = new URLSearchParams({ path: filePath })
    return api.put<WriteFileResult>(`/api/filesystem/write?${q}`, { content })
  },

  deletePath(targetPath: string) {
    const q = new URLSearchParams({ path: targetPath })
    return api.delete<DeleteResult>(`/api/filesystem/delete?${q}`)
  },

  createDir(dirPath: string) {
    return api.post<{ success: boolean; path: string }>('/api/filesystem/mkdir', { path: dirPath })
  },

  movePath(source: string, destination: string) {
    return api.post<{ success: boolean; source: string; destination: string }>(
      '/api/filesystem/move',
      { source, destination },
    )
  },

  /** Get file size via HEAD request to /api/filesystem/file */
  async getFileSize(filePath: string): Promise<number> {
    const url = `${getBaseUrl()}/api/filesystem/file?path=${encodeURIComponent(filePath)}`
    const res = await fetch(url, { method: 'HEAD' })
    if (!res.ok) return -1
    return Number(res.headers.get('content-length') || -1)
  },
}
