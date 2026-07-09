/**
 * Filesystem API — 文件系统浏览、读写、删除、移动
 *
 * 参照 smart-code src/server/api/filesystem.ts 照搬。
 *
 * Routes:
 *   GET     /api/filesystem/browse     — 浏览目录或搜索文件
 *   GET     /api/filesystem/file       — 提供二进制文件（图片/PDF/Office）
 *   GET     /api/filesystem/read       — 读取文本文件内容
 *   PUT     /api/filesystem/write      — 写入文本文件内容
 *   DELETE  /api/filesystem/delete     — 删除文件或目录
 *   POST    /api/filesystem/mkdir      — 创建目录
 *   POST    /api/filesystem/move       — 移动/重命名文件或目录
 *   GET     /api/filesystem/list       — (兼容旧版) 列出目录内容
 */

import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { ApiError, errorResponse } from '../middleware/errorHandler'

const BINARY_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.avif', '.svg',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.flv', '.wmv',
  '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.dat',
  '.msi', '.dmg', '.deb', '.rpm', '.iso', '.img', '.apk', '.appx', '.msix', '.cab',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.sqlite', '.db',
  '.wasm', '.class', '.o', '.a', '.lib', '.pyc', '.pyo',
])

const MAX_TEXT_FILE_SIZE = 2 * 1024 * 1024 // 2MB

function isWithinRoot(targetPath: string, rootPath: string): boolean {
  if (targetPath === rootPath) return true
  const separator = rootPath.endsWith(path.sep) ? '' : path.sep
  return targetPath.startsWith(rootPath + separator)
}

function isAllowedFilesystemPath(targetPath: string): boolean {
  const resolvedPath = path.resolve(targetPath)
  const homeDir = path.resolve(os.homedir())

  if (isWithinRoot(resolvedPath, homeDir) || isWithinRoot(resolvedPath, '/tmp')) {
    return true
  }

  if (process.platform === 'darwin' && isWithinRoot(resolvedPath, '/private/tmp')) {
    return true
  }

  const cwd = path.resolve(process.cwd())
  if (isWithinRoot(resolvedPath, cwd)) {
    return true
  }

  // Windows: allow all local drive roots
  if (process.platform === 'win32') {
    const driveMatch = /^([A-Za-z]):[\\\/]/.exec(resolvedPath)
    if (driveMatch) {
      const driveRoot = `${driveMatch[1]}:\\`
      if (isWithinRoot(resolvedPath, driveRoot) || resolvedPath === driveRoot) {
        return true
      }
    }
  }

  return false
}

export async function handleFilesystemApi(
  req: Request,
  url: URL,
  segments: string[],
): Promise<Response> {
  try {
    const action = segments[2]

    if (action === 'browse' && req.method === 'GET') {
      return await handleBrowse(url)
    }

    if (action === 'file') {
      return await handleServeFile(url, req.method)
    }

    if (action === 'read' && req.method === 'GET') {
      return await handleReadFile(url)
    }

    if (action === 'write' && req.method === 'PUT') {
      return await handleWriteFile(url, req)
    }

    if (action === 'delete' && req.method === 'DELETE') {
      return await handleDelete(url)
    }

    if (action === 'mkdir' && req.method === 'POST') {
      return await handleMkdir(req)
    }

    if (action === 'move' && req.method === 'POST') {
      return await handleMove(req)
    }

    // 兼容旧版 list 端点
    if (action === 'list' && req.method === 'GET') {
      return await handleBrowse(url)
    }

    throw new ApiError(404, `Unknown filesystem action: ${action || '(none)'}`)
  } catch (error) {
    return errorResponse(error)
  }
}

async function handleServeFile(url: URL, method?: string): Promise<Response> {
  const filePath = url.searchParams.get('path')
  if (!filePath) {
    throw ApiError.badRequest('Missing path parameter')
  }

  const resolvedPath = path.resolve(filePath)

  if (!isAllowedFilesystemPath(resolvedPath)) {
    throw ApiError.forbidden('Access denied: path outside allowed directory')
  }

  const ext = path.extname(resolvedPath).toLowerCase()
  const mimeType = BINARY_MIME_TYPES[ext]

  if (!mimeType) {
    throw ApiError.badRequest('Unsupported file type')
  }

  try {
    const stat = fs.statSync(resolvedPath)
    if (!stat.isFile()) {
      throw ApiError.badRequest('Not a file')
    }

    // HEAD request: return only headers (for file size check)
    if (method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': String(stat.size),
        },
      })
    }

    if (stat.size > 50 * 1024 * 1024) {
      throw ApiError.badRequest('File too large')
    }

    const data = fs.readFileSync(resolvedPath)
    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(stat.size),
        'Cache-Control': 'no-cache',
      },
    })
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw ApiError.notFound('File not found')
  }
}

async function handleBrowse(url: URL): Promise<Response> {
  const targetPath = url.searchParams.get('path') || os.homedir()
  const resolvedPath = path.resolve(targetPath)

  if (!isAllowedFilesystemPath(resolvedPath)) {
    throw ApiError.forbidden('Access denied: path outside allowed directory')
  }

  const searchQuery = url.searchParams.get('search') || ''
  const includeFiles = url.searchParams.get('includeFiles') === 'true'
  const maxResults = Math.min(parseInt(url.searchParams.get('maxResults') || '200', 10), 200)

  try {
    const stat = fs.statSync(resolvedPath)
    if (!stat.isDirectory()) {
      throw ApiError.badRequest('Not a directory')
    }

    const entries = fs.readdirSync(resolvedPath, { withFileTypes: true })

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.cache', 'coverage'])
      const results: Array<{ name: string; path: string; isDirectory: boolean }> = []

      const searchDir = (dir: string, depth: number) => {
        if (depth > 8 || results.length >= maxResults) return
        let dirEntries: fs.Dirent[]
        try {
          dirEntries = fs.readdirSync(dir, { withFileTypes: true })
        } catch {
          return
        }
        for (const e of dirEntries) {
          if (results.length >= maxResults) break
          const fullPath = path.join(dir, e.name)
          if (e.isDirectory()) {
            if (SKIP_DIRS.has(e.name)) continue
            if (e.name.toLowerCase().includes(query)) {
              results.push({ name: e.name, path: fullPath, isDirectory: true })
            }
            searchDir(fullPath, depth + 1)
          } else {
            if (e.name.toLowerCase().includes(query)) {
              results.push({ name: e.name, path: fullPath, isDirectory: false })
            }
          }
        }
      }

      searchDir(resolvedPath, 0)
      results.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      return Response.json({
        currentPath: resolvedPath,
        parentPath: path.dirname(resolvedPath),
        entries: results,
        query: searchQuery,
      })
    }

    // Browse mode
    const filtered = entries.filter((e) => {
      if (e.isDirectory()) return true
      return includeFiles
    })

    const entriesList = filtered
      .map((e) => ({
        name: e.name,
        path: path.join(resolvedPath, e.name),
        isDirectory: e.isDirectory(),
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })

    return Response.json({
      currentPath: resolvedPath,
      parentPath: path.dirname(resolvedPath),
      entries: entriesList,
    })
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw ApiError.internal(`Cannot read directory: ${err}`)
  }
}

async function handleReadFile(url: URL): Promise<Response> {
  const filePath = url.searchParams.get('path')
  if (!filePath) {
    throw ApiError.badRequest('Missing path parameter')
  }

  const resolvedPath = path.resolve(filePath)

  if (!isAllowedFilesystemPath(resolvedPath)) {
    throw ApiError.forbidden('Access denied: path outside allowed directory')
  }

  const ext = path.extname(resolvedPath).toLowerCase()
  if (BINARY_EXTENSIONS.has(ext)) {
    throw ApiError.badRequest('Cannot read binary file')
  }

  try {
    const stat = fs.statSync(resolvedPath)
    if (!stat.isFile()) {
      throw ApiError.badRequest('Not a file')
    }
    if (stat.size > MAX_TEXT_FILE_SIZE) {
      throw ApiError.badRequest('File too large (max 2MB)')
    }

    const content = fs.readFileSync(resolvedPath, 'utf8')
    return Response.json({ content, path: resolvedPath, size: stat.size })
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw ApiError.notFound('File not found')
  }
}

async function handleWriteFile(url: URL, req: Request): Promise<Response> {
  const filePath = url.searchParams.get('path')
  if (!filePath) {
    throw ApiError.badRequest('Missing path parameter')
  }

  const resolvedPath = path.resolve(filePath)

  if (!isAllowedFilesystemPath(resolvedPath)) {
    throw ApiError.forbidden('Access denied: path outside allowed directory')
  }

  let parsed: { content?: string }
  try {
    parsed = await req.json()
  } catch {
    throw ApiError.badRequest('Invalid JSON body')
  }

  if (typeof parsed.content !== 'string') {
    throw ApiError.badRequest('Missing "content" field')
  }

  try {
    const dir = path.dirname(resolvedPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(resolvedPath, parsed.content, 'utf8')
    return Response.json({ success: true, path: resolvedPath })
  } catch (err) {
    throw ApiError.internal(`Write failed: ${err}`)
  }
}

async function handleDelete(url: URL): Promise<Response> {
  const targetPath = url.searchParams.get('path')
  if (!targetPath) {
    throw ApiError.badRequest('Missing path parameter')
  }

  const resolvedPath = path.resolve(targetPath)

  if (!isAllowedFilesystemPath(resolvedPath)) {
    throw ApiError.forbidden('Access denied: path outside allowed directory')
  }

  try {
    const stat = fs.statSync(resolvedPath)
    if (stat.isDirectory()) {
      fs.rmSync(resolvedPath, { recursive: true, force: true })
    } else {
      fs.unlinkSync(resolvedPath)
    }
    return Response.json({ success: true, path: resolvedPath })
  } catch (err) {
    throw ApiError.internal(`Delete failed: ${err}`)
  }
}

async function handleMkdir(req: Request): Promise<Response> {
  let parsed: { path?: string }
  try {
    parsed = await req.json()
  } catch {
    throw ApiError.badRequest('Invalid JSON body')
  }

  const dirPath = parsed.path
  if (!dirPath) {
    throw ApiError.badRequest('Missing "path" field')
  }

  const resolvedPath = path.resolve(dirPath)

  if (!isAllowedFilesystemPath(resolvedPath)) {
    throw ApiError.forbidden('Access denied: path outside allowed directory')
  }

  try {
    fs.mkdirSync(resolvedPath, { recursive: true })
    return Response.json({ success: true, path: resolvedPath })
  } catch (err) {
    throw ApiError.internal(`mkdir failed: ${err}`)
  }
}

async function handleMove(req: Request): Promise<Response> {
  let parsed: { source?: string; destination?: string }
  try {
    parsed = await req.json()
  } catch {
    throw ApiError.badRequest('Invalid JSON body')
  }

  const { source, destination } = parsed
  if (!source || !destination) {
    throw ApiError.badRequest('Missing "source" or "destination" field')
  }

  const resolvedSource = path.resolve(source)
  const resolvedDest = path.resolve(destination)

  if (!isAllowedFilesystemPath(resolvedSource)) {
    throw ApiError.forbidden('Access denied: source path outside allowed directory')
  }
  if (!isAllowedFilesystemPath(resolvedDest)) {
    throw ApiError.forbidden('Access denied: destination path outside allowed directory')
  }

  try {
    if (!fs.existsSync(resolvedSource)) {
      throw ApiError.notFound('Source not found')
    }

    const normalizedSource = path.normalize(resolvedSource)
    const normalizedDest = path.normalize(resolvedDest)
    if (normalizedDest.startsWith(normalizedSource + path.sep)) {
      throw ApiError.badRequest('Cannot move a directory into itself or its subdirectories')
    }

    const destParent = path.dirname(resolvedDest)
    if (!fs.existsSync(destParent)) {
      fs.mkdirSync(destParent, { recursive: true })
    }

    if (fs.existsSync(resolvedDest)) {
      throw new ApiError(409, 'Destination already exists')
    }

    fs.renameSync(resolvedSource, resolvedDest)
    return Response.json({ success: true, source: resolvedSource, destination: resolvedDest })
  } catch (err) {
    // renameSync may fail across different drives on Windows — fall back to copy+delete
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'EXDEV') {
      try {
        const stat = fs.statSync(resolvedSource)
        if (stat.isDirectory()) {
          fs.cpSync(resolvedSource, resolvedDest, { recursive: true })
          fs.rmSync(resolvedSource, { recursive: true, force: true })
        } else {
          fs.copyFileSync(resolvedSource, resolvedDest)
          fs.unlinkSync(resolvedSource)
        }
        return Response.json({ success: true, source: resolvedSource, destination: resolvedDest })
      } catch (fallbackErr) {
        throw ApiError.internal(`Move failed: ${fallbackErr}`)
      }
    }
    if (err instanceof ApiError) throw err
    throw ApiError.internal(`Move failed: ${err}`)
  }
}
