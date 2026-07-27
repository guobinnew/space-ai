/**
 * API Router — 将请求路由到对应的 API handler
 *
 * 参照 smart-code src/server/router.ts 复刻。
 * 目前实现 status 端点，其余端点返回 501 占位。
 */

import { handleStatusApi } from './api/status'
import { handleSessionsApi } from './api/sessions'
import { handleProvidersApi } from './api/providers'
import { handleSkillsApi } from './api/skills'
import { handleComputerUseApi } from './api/computerUse'
import { handleMemoryApi } from './api/memory'
import { handleSettingsApi } from './api/settings'
import { handleFilesystemApi } from './api/filesystem'
import { handleGitApi } from './api/git'
import { handleTasksApi } from './api/tasks'
import { handleUsageApi } from './api/usage'
import { handleScheduledTasksApi } from './api/scheduled-tasks'
import { ApiError, errorResponse } from './middleware/errorHandler'

export async function handleApiRequest(req: Request, url: URL): Promise<Response> {
  const path = url.pathname
  const segments = path.split('/').filter(Boolean) // ['api', 'sessions', ...]

  const resource = segments[1]

  try {
    switch (resource) {
      case 'status':
        return await handleStatusApi(req, url, segments)

      case 'sessions':
        return await handleSessionsApi(req, url, segments)

      case 'providers':
        return await handleProvidersApi(req, url, segments)

      case 'skills':
        return await handleSkillsApi(req, url, segments)

      case 'computer-use':
        return await handleComputerUseApi(req, url, segments)

      case 'memory':
        return await handleMemoryApi(req, url, segments)

      case 'settings':
        return await handleSettingsApi(req, url, segments)

      case 'filesystem':
        return await handleFilesystemApi(req, url, segments)

      case 'git':
        return await handleGitApi(req, url, segments)

      case 'tasks':
        return await handleTasksApi(req, url, segments)

      case 'usage':
        return await handleUsageApi(req, url)

      case 'scheduled-tasks':
        return await handleScheduledTasksApi(req, url)

      case 'health':
        return Response.json({ status: 'ok', timestamp: new Date().toISOString() })

      case 'info':
        return Response.json({
          name: 'smart-space-agent',
          version: process.env.APP_VERSION || '0.1.0',
          nodeVersion: process.version,
          bunVersion: typeof Bun !== 'undefined' ? Bun.version : 'N/A',
          platform: process.platform,
          arch: process.arch,
          uptime: process.uptime(),
        })

      default:
        throw ApiError.notFound(`Unknown API resource: ${resource}`)
    }
  } catch (error) {
    return errorResponse(error)
  }
}
