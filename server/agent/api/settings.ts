/**
 * Settings REST API — 通用设置
 *
 * GET /api/settings       — 获取通用设置
 * PUT /api/settings       — 更新通用设置（部分字段）
 *
 * settings.json 中的 env 字段由 providerService 维护，本端点不涉及。
 */

import { settingService, type GeneralSettings } from '../services/settingService'
import { ApiError, errorResponse } from '../middleware/errorHandler'

async function parseJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>
  } catch {
    throw ApiError.badRequest('Invalid JSON body')
  }
}

/** 校验并提取合法的部分通用设置字段 */
function extractPartial(body: Record<string, unknown>): Partial<GeneralSettings> {
  const partial: Partial<GeneralSettings> = {}

  if (body.theme !== undefined) {
    if (body.theme !== 'dark' && body.theme !== 'light') {
      throw ApiError.badRequest('theme must be "dark" or "light"')
    }
    partial.theme = body.theme
  }

  if (body.locale !== undefined) {
    if (body.locale !== 'zh' && body.locale !== 'en') {
      throw ApiError.badRequest('locale must be "zh" or "en"')
    }
    partial.locale = body.locale
  }

  if (body.defaultWorkDir !== undefined) {
    if (typeof body.defaultWorkDir !== 'string') {
      throw ApiError.badRequest('defaultWorkDir must be a string')
    }
    partial.defaultWorkDir = body.defaultWorkDir
  }

  if (body.notifyOnCompletion !== undefined) {
    if (typeof body.notifyOnCompletion !== 'boolean') {
      throw ApiError.badRequest('notifyOnCompletion must be a boolean')
    }
    partial.notifyOnCompletion = body.notifyOnCompletion
  }

  return partial
}

export async function handleSettingsApi(
  req: Request,
  _url: URL,
  segments: string[],
): Promise<Response> {
  try {
    // 仅处理 /api/settings（无子段），其他返回 404
    if (segments[2]) {
      throw ApiError.notFound(`Unknown settings path: ${segments[2]}`)
    }

    if (req.method === 'GET') {
      const settings = await settingService.getGeneralSettings()
      return Response.json({ settings })
    }

    if (req.method === 'PUT') {
      const body = await parseJsonBody(req)
      const partial = extractPartial(body)
      const updated = await settingService.updateGeneralSettings(partial)
      return Response.json({ settings: updated })
    }

    throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
  } catch (error) {
    return errorResponse(error)
  }
}
