/**
 * Agents API
 *
 * GET    /api/agents          — 列出所有智能体
 * GET    /api/agents/:id      — 获取智能体详情
 * POST   /api/agents          — 创建自定义智能体
 * PUT    /api/agents/:id      — 更新自定义智能体
 * DELETE /api/agents/:id      — 删除自定义智能体
 */
import {
  listAllAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  getAgentToolNames,
  type CustomAgentInput,
} from '../services/agentService'

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status })
}

function errResponse(msg: string, status = 400): Response {
  return Response.json({ error: msg }, { status })
}

export async function handleAgentsApi(req: Request, url: URL, segments: string[]): Promise<Response> {
  const id = segments[2] ? decodeURIComponent(segments[2]) : null

  try {
    // GET /api/agents — list all
    if (!id && req.method === 'GET') {
      const agents = await listAllAgents()
      const result = agents.map((a) => ({
        ...a,
        availableTools: getAgentToolNames(a),
      }))
      return jsonResponse({ agents: result })
    }

    // GET /api/agents/:id — get one
    if (id && req.method === 'GET') {
      const agent = await getAgent(id)
      if (!agent) return errResponse('Agent not found', 404)
      return jsonResponse({ ...agent, availableTools: getAgentToolNames(agent) })
    }

    // POST /api/agents — create custom
    if (!id && req.method === 'POST') {
      const body = (await req.json()) as CustomAgentInput
      if (!body.agentType?.trim()) return errResponse('agentType is required')
      if (!body.whenToUse?.trim()) return errResponse('whenToUse is required')
      if (!body.systemPrompt?.trim()) return errResponse('systemPrompt is required')

      // Check for duplicate
      const existing = await getAgent(body.agentType)
      if (existing) return errResponse(`Agent '${body.agentType}' already exists`, 409)

      const agent = await createAgent(body)
      return jsonResponse(agent, 201)
    }

    // PUT /api/agents/:id — update custom
    if (id && req.method === 'PUT') {
      const body = (await req.json()) as Partial<CustomAgentInput>
      const updated = await updateAgent(id, body)
      if (!updated) return errResponse('Agent not found or is built-in (read-only)', 404)
      return jsonResponse(updated)
    }

    // DELETE /api/agents/:id — delete custom
    if (id && req.method === 'DELETE') {
      const deleted = await deleteAgent(id)
      if (!deleted) return errResponse('Agent not found or is built-in (read-only)', 404)
      return jsonResponse({ ok: true })
    }

    return errResponse(`No route: ${req.method} ${url.pathname}`, 404)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: 'INTERNAL_ERROR', message: msg }, { status: 500 })
  }
}
