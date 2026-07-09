/**
 * Filesystem API — 文件系统浏览
 *
 * GET /api/filesystem/list?path=xxx  — 列出目录内容
 * GET /api/filesystem/read?path=xxx  — 读取文件内容(带行号)
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { ApiError, errorResponse } from '../middleware/errorHandler'

interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modifiedAt: string
}

const MAX_READ_LINES = 2000
const MAX_READ_SIZE = 512 * 1024 // 512KB

export async function handleFilesystemApi(
  req: Request,
  url: URL,
  segments: string[],
): Promise<Response> {
  try {
    const action = segments[2]

    if (action === 'list' && req.method === 'GET') {
      return await listDirectory(url)
    }

    if (action === 'read' && req.method === 'GET') {
      return await readFile(url)
    }

    throw new ApiError(404, `Unknown filesystem action: ${action || '(none)'}`)
  } catch (error) {
    return errorResponse(error)
  }
}

async function listDirectory(url: URL): Promise<Response> {
  const dirPath = url.searchParams.get('path')
  if (!dirPath) {
    throw ApiError.badRequest('path query parameter is required')
  }

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const result: DirEntry[] = []

    for (const entry of entries) {
      // Skip hidden files and common ignore dirs
      if (entry.name.startsWith('.')) continue
      if (entry.isDirectory() && ['node_modules', 'dist', 'build', '__pycache__', '.git', 'target', 'vendor'].includes(entry.name)) continue

      const fullPath = path.join(dirPath, entry.name)
      try {
        const stat = await fs.stat(fullPath)
        result.push({
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        })
      } catch {
        // Skip entries that can't be stat'd
      }
    }

    // Sort: directories first, then files, alphabetically
    result.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return Response.json({ entries: result, path: dirPath })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') throw ApiError.notFound(`Directory not found: ${dirPath}`)
    if (code === 'ENOTDIR') throw ApiError.badRequest(`Not a directory: ${dirPath}`)
    throw ApiError.internal(`Failed to list directory: ${err}`)
  }
}

async function readFile(url: URL): Promise<Response> {
  const filePath = url.searchParams.get('path')
  if (!filePath) {
    throw ApiError.badRequest('path query parameter is required')
  }

  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0)
  const limit = Math.min(Number(url.searchParams.get('limit')) || MAX_READ_LINES, MAX_READ_LINES)

  try {
    const stat = await fs.stat(filePath)
    if (stat.size > MAX_READ_SIZE) {
      // Read only the beginning for large files
    }

    const content = await fs.readFile(filePath, 'utf-8')
    const lines = content.split('\n')
    const hasTrailingNewline = content.endsWith('\n')
    const effectiveLines = hasTrailingNewline ? lines.slice(0, -1) : lines

    const startIdx = offset
    const endIdx = Math.min(startIdx + limit, effectiveLines.length)
    const slice = effectiveLines.slice(startIdx, endIdx)

    // cat -n format
    const numbered = slice
      .map((line, i) => `${String(startIdx + i + 1).padStart(6, ' ')}\t${line}`)
      .join('\n')

    return Response.json({
      content: numbered || '<file is empty>',
      path: filePath,
      totalLines: effectiveLines.length,
      offset: startIdx,
      limit,
      truncated: endIdx < effectiveLines.length,
    })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') throw ApiError.notFound(`File not found: ${filePath}`)
    if (code === 'EISDIR') throw ApiError.badRequest(`Path is a directory: ${filePath}`)
    throw ApiError.internal(`Failed to read file: ${err}`)
  }
}
