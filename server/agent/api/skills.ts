/**
 * Skills API
 *
 * GET  /api/skills          — list skills (扫描 ~/.spaceai/skills/)
 * GET  /api/skills/:name    — get skill detail (含正文)
 * POST /api/skills/import   — import skill pack (.zip)  [TODO]
 */

import { skillService } from '../services/skillService'
import { ApiError, errorResponse } from '../middleware/errorHandler'

export async function handleSkillsApi(
  req: Request,
  _url: URL,
  segments: string[],
): Promise<Response> {
  try {
    const skillName = segments[2]

    // POST /api/skills/import
    if (skillName === 'import' && req.method === 'POST') {
      // TODO: implement zip import — 解压到 ~/.spaceai/skills/<name>/
      return Response.json({ success: true, message: '技能导入功能开发中' })
    }

    // GET /api/skills
    if (!skillName && req.method === 'GET') {
      const skills = await skillService.listSkills()
      return Response.json({ skills })
    }

    // GET /api/skills/:name
    if (skillName && req.method === 'GET') {
      const skill = await skillService.getSkill(skillName)
      return Response.json({ skill })
    }

    throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
  } catch (error) {
    return errorResponse(error)
  }
}
