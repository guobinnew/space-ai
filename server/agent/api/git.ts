/**
 * Git API — git 状态和 diff
 *
 * 参照 smart-code src/server/api/git.ts 照搬。
 *
 * Routes:
 *   GET /api/git/status?path=<workDir>  — git status --porcelain
 *   GET /api/git/diff?path=<workDir>&file=<filePath> — 单文件 diff
 */

import * as path from 'path'
import * as fs from 'fs'
import { execFileSync } from 'child_process'
import { ApiError, errorResponse } from '../middleware/errorHandler'

type FileGitStatus = {
  path: string
  statusCode: string
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed' | 'copied' | 'staged' | 'staged-modified'
}

function parseStatusCode(xy: string): FileGitStatus['status'] {
  const x = xy[0]
  const y = xy[1]

  if (x === 'R') return 'renamed'
  if (x === 'C') return 'copied'
  if (x === 'A') return y === 'M' ? 'staged-modified' : 'added'
  if (y === 'D') return 'deleted'
  if (x === 'D') return 'staged'
  if (x === 'M' && y === 'M') return 'staged-modified'
  if (x === 'M') return 'staged'
  if (y === 'M') return 'modified'
  if (xy === '??') return 'untracked'
  return 'modified'
}

export async function handleGitApi(
  _req: Request,
  url: URL,
  segments: string[],
): Promise<Response> {
  try {
    const action = segments[2]

    if (action === 'status') {
      return handleGitStatus(url)
    }

    if (action === 'diff') {
      return handleGitDiff(url)
    }

    throw new ApiError(404, `Unknown git action: ${action || '(none)'}`)
  } catch (error) {
    return errorResponse(error)
  }
}

function handleGitStatus(url: URL): Response {
  const workDir = url.searchParams.get('path')
  if (!workDir) {
    throw ApiError.badRequest('Missing path parameter')
  }

  const resolvedPath = path.resolve(workDir)

  try {
    const stat = fs.statSync(resolvedPath)
    if (!stat.isDirectory()) {
      throw ApiError.badRequest('Not a directory')
    }
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw ApiError.notFound('Directory not found')
  }

  // Check if it's a git repo
  const gitDir = path.join(resolvedPath, '.git')
  try {
    fs.accessSync(gitDir)
  } catch {
    return Response.json({ files: [], branch: null, isGitRepo: false })
  }

  const gitEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_NO_AUTO_GC: '1',
    GIT_ASK_PASS: 'echo',
    GIT_PROTOCOL_FROM_USER: '0',
    HOME: process.env.HOME || process.env.USERPROFILE || '',
  }

  try {
    let statusOutput = ''
    try {
      statusOutput = execFileSync('git', ['--no-optional-locks', 'status', '--porcelain', '-uno'], {
        cwd: resolvedPath,
        encoding: 'utf8',
        timeout: 60000,
        maxBuffer: 1024 * 1024,
        env: gitEnv,
      })
    } catch (err: any) {
      const errorMsg = err?.message || String(err)
      console.error(`[git.ts] git status failed in ${resolvedPath}:`, errorMsg)
      return Response.json({ files: [], branch: null, isGitRepo: true, error: `git timeout: ${errorMsg}` })
    }

    let branch: string | null = null
    try {
      branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: resolvedPath,
        encoding: 'utf8',
        timeout: 10000,
        env: gitEnv,
      }).trim() || null
    } catch {
      // Ignore branch errors
    }

    const files: FileGitStatus[] = []
    const lines = statusOutput.split('\n').filter(Boolean)

    for (const line of lines) {
      const xy = line.substring(0, 2)
      let filePath = line.substring(3)

      if (xy[0] === 'R' || xy[0] === 'C') {
        const arrowIdx = filePath.indexOf(' -> ')
        if (arrowIdx !== -1) {
          filePath = filePath.substring(arrowIdx + 4)
        }
      }

      if (filePath.startsWith('"') && filePath.endsWith('"')) {
        filePath = filePath.slice(1, -1)
      }

      const absPath = path.resolve(resolvedPath, filePath)

      files.push({
        path: absPath,
        statusCode: xy,
        status: parseStatusCode(xy),
      })
    }

    return Response.json({ files, branch, isGitRepo: true })
  } catch (err) {
    throw ApiError.internal(`Git command failed: ${err}`)
  }
}

function handleGitDiff(url: URL): Response {
  const workDir = url.searchParams.get('path')
  const filePath = url.searchParams.get('file')
  if (!workDir || !filePath) {
    throw ApiError.badRequest('Missing path or file parameter')
  }

  const resolvedWorkDir = path.resolve(workDir)
  const resolvedFile = path.resolve(filePath)

  if (!resolvedFile.startsWith(resolvedWorkDir + path.sep) && resolvedFile !== resolvedWorkDir) {
    throw ApiError.forbidden('File is outside the workspace')
  }

  try {
    fs.accessSync(path.join(resolvedWorkDir, '.git'))
  } catch {
    return Response.json({ diff: '', stagedDiff: '', isGitRepo: false })
  }

  const relPath = path.relative(resolvedWorkDir, resolvedFile).replace(/\\/g, '/')

  try {
    let diffOutput = ''
    try {
      diffOutput = execFileSync('git', ['diff', '--no-color', '--', relPath], {
        cwd: resolvedWorkDir,
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 2 * 1024 * 1024,
      })
    } catch {
      // File might be untracked
    }

    if (!diffOutput) {
      try {
        diffOutput = execFileSync('git', ['diff', '--no-color', '--no-index', '/dev/null', relPath], {
          cwd: resolvedWorkDir,
          encoding: 'utf8',
          timeout: 5000,
          maxBuffer: 2 * 1024 * 1024,
        })
      } catch (e: any) {
        if (e?.stdout && typeof e.stdout === 'string') {
          diffOutput = e.stdout
        }
      }
    }

    let stagedDiff = ''
    try {
      stagedDiff = execFileSync('git', ['diff', '--cached', '--no-color', '--', relPath], {
        cwd: resolvedWorkDir,
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 2 * 1024 * 1024,
      })
    } catch {
      // Ignore
    }

    return Response.json({ diff: diffOutput, stagedDiff, isGitRepo: true })
  } catch (err) {
    throw ApiError.internal(`Git diff failed: ${err}`)
  }
}
