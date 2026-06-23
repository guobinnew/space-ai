/**
 * Skills API
 *
 * GET  /api/skills          — list skills
 * GET  /api/skills/:name    — get skill detail
 * POST /api/skills/import   — import skill pack (.zip)
 */

import { ApiError, errorResponse } from '../middleware/errorHandler'

type SkillMeta = {
  name: string
  description: string
  source: 'builtin' | 'user' | 'project'
  userInvocable: boolean
  tokenEstimate?: number
}

// Placeholder skill list — in production this would scan ~/.spaceai/skills/
const BUILTIN_SKILLS: SkillMeta[] = [
  { name: 'code-review', description: '代码审查', source: 'builtin', userInvocable: true, tokenEstimate: 500 },
  { name: 'tdd', description: '测试驱动开发', source: 'builtin', userInvocable: true, tokenEstimate: 800 },
  { name: 'pdf', description: 'PDF 文件处理', source: 'builtin', userInvocable: true, tokenEstimate: 300 },
]

export async function handleSkillsApi(
  req: Request,
  _url: URL,
  segments: string[],
): Promise<Response> {
  try {
    const skillName = segments[2]

    // POST /api/skills/import
    if (skillName === 'import' && req.method === 'POST') {
      // TODO: implement zip import
      return Response.json({ success: true, message: '技能导入功能开发中' })
    }

    // GET /api/skills
    if (!skillName && req.method === 'GET') {
      return Response.json({ skills: BUILTIN_SKILLS })
    }

    // GET /api/skills/:name
    if (skillName && req.method === 'GET') {
      const skill = BUILTIN_SKILLS.find((s) => s.name === skillName)
      if (!skill) throw ApiError.notFound(`Skill not found: ${skillName}`)
      return Response.json({ skill: { ...skill, content: '' } })
    }

    throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
  } catch (error) {
    return errorResponse(error)
  }
}
