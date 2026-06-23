/**
 * Memory API
 *
 * GET    /api/memory          — list memory entries + stats
 * GET    /api/memory/:id      — get entry detail
 * POST   /api/memory          — create entry
 * PUT    /api/memory/:id      — update entry
 * DELETE /api/memory/:id      — delete entry
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { ApiError, errorResponse } from '../middleware/errorHandler'

type MemoryEntry = {
  id: string
  title: string
  content: string
  category: string
  createdAt: string
  updatedAt: string
}

function getConfigDir(): string {
  return process.env.SPACEAI_CONFIG_DIR || path.join(os.homedir(), '.spaceai')
}

function getMemoryDir(): string {
  return path.join(getConfigDir(), 'memory')
}

async function ensureMemoryDir(): Promise<void> {
  await fs.mkdir(getMemoryDir(), { recursive: true })
}

async function readAllEntries(): Promise<MemoryEntry[]> {
  try {
    const files = await fs.readdir(getMemoryDir())
    const entries: MemoryEntry[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = await fs.readFile(path.join(getMemoryDir(), file), 'utf-8')
        entries.push(JSON.parse(raw))
      } catch {
        // skip malformed
      }
    }
    return entries
  } catch {
    return []
  }
}

export async function handleMemoryApi(
  req: Request,
  _url: URL,
  segments: string[],
): Promise<Response> {
  try {
    const entryId = segments[2]

    // GET /api/memory
    if (!entryId && req.method === 'GET') {
      const entries = await readAllEntries()
      const categories = [...new Set(entries.map((e) => e.category))]
      const totalSize = entries.reduce((sum, e) => sum + JSON.stringify(e).length, 0)
      return Response.json({ entries, stats: { totalEntries: entries.length, totalSize, categories } })
    }

    // POST /api/memory
    if (!entryId && req.method === 'POST') {
      const body = (await req.json()) as { title?: string; content?: string; category?: string }
      if (!body.title || !body.content) throw ApiError.badRequest('title and content are required')

      await ensureMemoryDir()
      const now = new Date().toISOString()
      const entry: MemoryEntry = {
        id: `mem-${Date.now()}`,
        title: body.title,
        content: body.content,
        category: body.category || 'general',
        createdAt: now,
        updatedAt: now,
      }
      await fs.writeFile(path.join(getMemoryDir(), `${entry.id}.json`), JSON.stringify(entry, null, 2))
      return Response.json({ entry }, { status: 201 })
    }

    // GET /api/memory/:id
    if (entryId && req.method === 'GET') {
      try {
        const raw = await fs.readFile(path.join(getMemoryDir(), `${entryId}.json`), 'utf-8')
        return Response.json({ entry: JSON.parse(raw) })
      } catch {
        throw ApiError.notFound(`Memory entry not found: ${entryId}`)
      }
    }

    // PUT /api/memory/:id
    if (entryId && req.method === 'PUT') {
      const body = (await req.json()) as Partial<MemoryEntry>
      try {
        const raw = await fs.readFile(path.join(getMemoryDir(), `${entryId}.json`), 'utf-8')
        const existing = JSON.parse(raw) as MemoryEntry
        const updated = { ...existing, ...body, id: entryId, updatedAt: new Date().toISOString() }
        await fs.writeFile(path.join(getMemoryDir(), `${entryId}.json`), JSON.stringify(updated, null, 2))
        return Response.json({ entry: updated })
      } catch {
        throw ApiError.notFound(`Memory entry not found: ${entryId}`)
      }
    }

    // DELETE /api/memory/:id
    if (entryId && req.method === 'DELETE') {
      try {
        await fs.unlink(path.join(getMemoryDir(), `${entryId}.json`))
      } catch {
        // ignore
      }
      return Response.json({ ok: true })
    }

    throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
  } catch (error) {
    return errorResponse(error)
  }
}
