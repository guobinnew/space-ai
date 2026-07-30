/**
 * Skills API
 *
 * GET  /api/skills                — list skills (扫描 ~/.spaceai/skills/)
 * GET  /api/skills/:name          — get skill detail (含正文)
 * GET  /api/skills/:name/detail   — get skill full detail (含文件树)
 * GET  /api/skills/:name/file     — get skill file content
 * POST /api/skills/import         — import skill pack (.zip)  [TODO]
 */

import { skillService } from '../services/skillService'
import { ApiError, errorResponse } from '../middleware/errorHandler'

export async function handleSkillsApi(
  req: Request,
  url: URL,
  segments: string[],
): Promise<Response> {
  try {
    const skillName = segments[2] ? decodeURIComponent(segments[2]) : undefined
    const subAction = segments[3] // 'detail' | 'file'

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

    // GET /api/skills/:name/detail — 完整详情（含文件树）
    if (skillName && subAction === 'detail' && req.method === 'GET') {
      const detail = await skillService.getSkillDetail(skillName)
      return Response.json(detail)
    }

    // GET /api/skills/:name/file?path=xxx — 读取技能目录内文件
    if (skillName && subAction === 'file' && req.method === 'GET') {
      const filePath = url.searchParams.get('path')
      if (!filePath) {
        throw new ApiError(400, 'Missing file path', 'BAD_REQUEST')
      }
      const file = await skillService.getSkillFile(skillName, filePath)
      return Response.json(file)
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
