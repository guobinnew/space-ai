/**
 * Providers REST API
 *
 * 参照 smart-code api/providers.ts 复刻。
 *
 * GET    /api/providers              — list all saved providers + activeId
 * GET    /api/providers/presets      — list available presets
 * GET    /api/providers/auth-status  — check whether any usable auth exists
 * POST   /api/providers              — add a provider
 * PUT    /api/providers/:id          — update a provider
 * DELETE /api/providers/:id          — delete a provider
 * POST   /api/providers/:id/activate — activate a saved provider
 * POST   /api/providers/:id/test     — test a saved provider
 * POST   /api/providers/test         — test unsaved config
 */

import { ProviderService, sanitizeProvider } from '../services/providerService'
import { PROVIDER_PRESETS } from '../config/providerPresets'
import { ApiError, errorResponse } from '../middleware/errorHandler'
import type { CreateProviderInput, UpdateProviderInput, TestProviderInput } from '../types/provider'

const providerService = new ProviderService()

function validateCreateInput(body: Record<string, unknown>): CreateProviderInput {
  if (typeof body.name !== 'string' || !body.name.trim()) throw ApiError.badRequest('name is required')
  if (typeof body.apiKey !== 'string' || !body.apiKey.trim()) throw ApiError.badRequest('apiKey is required')
  if (typeof body.baseUrl !== 'string' || !body.baseUrl.trim()) throw ApiError.badRequest('baseUrl is required')
  if (typeof body.presetId !== 'string') throw ApiError.badRequest('presetId is required')
  if (!body.models || typeof body.models !== 'object') throw ApiError.badRequest('models is required')

  const models = body.models as Record<string, unknown>
  if (typeof models.main !== 'string' || !models.main.trim()) throw ApiError.badRequest('models.main is required')

  return {
    presetId: body.presetId,
    name: body.name,
    apiKey: body.apiKey,
    baseUrl: body.baseUrl,
    ttsBaseUrl: body.ttsBaseUrl as string | undefined,
    ttsVoice: body.ttsVoice as string | undefined,
    apiFormat: body.apiFormat as CreateProviderInput['apiFormat'],
    models: body.models as CreateProviderInput['models'],
    capabilities: body.capabilities as CreateProviderInput['capabilities'],
    notes: body.notes as string | undefined,
  }
}

function validateUpdateInput(body: Record<string, unknown>): UpdateProviderInput {
  const input: UpdateProviderInput = {}
  if (body.name !== undefined) input.name = body.name as string
  if (body.apiKey !== undefined) input.apiKey = body.apiKey as string
  if (body.baseUrl !== undefined) input.baseUrl = body.baseUrl as string
  if (body.apiFormat !== undefined) input.apiFormat = body.apiFormat as UpdateProviderInput['apiFormat']
  if (body.models !== undefined) input.models = body.models as UpdateProviderInput['models']
  if (body.capabilities !== undefined) input.capabilities = body.capabilities as UpdateProviderInput['capabilities']
  if (body.notes !== undefined) input.notes = body.notes as string
  if (body.ttsBaseUrl !== undefined) input.ttsBaseUrl = body.ttsBaseUrl as string
  if (body.ttsVoice !== undefined) input.ttsVoice = body.ttsVoice as string
  return input
}

function validateTestInput(body: Record<string, unknown>): TestProviderInput {
  if (typeof body.baseUrl !== 'string' || !body.baseUrl.trim()) throw ApiError.badRequest('baseUrl is required')
  if (typeof body.apiKey !== 'string' || !body.apiKey.trim()) throw ApiError.badRequest('apiKey is required')
  if (typeof body.modelId !== 'string' || !body.modelId.trim()) throw ApiError.badRequest('modelId is required')
  return {
    baseUrl: body.baseUrl,
    apiKey: body.apiKey,
    modelId: body.modelId,
    apiFormat: body.apiFormat as TestProviderInput['apiFormat'],
  }
}

async function parseJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>
  } catch {
    throw ApiError.badRequest('Invalid JSON body')
  }
}

function methodNotAllowed(method: string): ApiError {
  return new ApiError(405, `Method ${method} not allowed`, 'METHOD_NOT_ALLOWED')
}

export async function handleProvidersApi(
  req: Request,
  _url: URL,
  segments: string[],
): Promise<Response> {
  try {
    const id = segments[2]
    const action = segments[3]

    // POST /api/providers/test
    if (id === 'test' && req.method === 'POST') {
      const body = await parseJsonBody(req)
      const input = validateTestInput(body)
      const result = await providerService.testProviderConfig(input)
      return Response.json({ result })
    }

    // GET /api/providers/presets
    if (id === 'presets' && req.method === 'GET') {
      return Response.json({ presets: PROVIDER_PRESETS })
    }

    // GET /api/providers/auth-status
    if (id === 'auth-status' && req.method === 'GET') {
      const status = await providerService.checkAuthStatus()
      return Response.json(status)
    }

    // /api/providers (no ID)
    if (!id) {
      if (req.method === 'GET') {
        const { providers, activeId } = await providerService.listProviders()
        return Response.json({ providers: providers.map(sanitizeProvider), activeId })
      }
      if (req.method === 'POST') {
        const body = await parseJsonBody(req)
        const input = validateCreateInput(body)
        const provider = await providerService.addProvider(input)
        return Response.json({ provider: sanitizeProvider(provider) }, { status: 201 })
      }
      throw methodNotAllowed(req.method)
    }

    // /api/providers/:id/activate
    if (action === 'activate') {
      if (req.method !== 'POST') throw methodNotAllowed(req.method)
      await providerService.activateProvider(id)
      return Response.json({ ok: true })
    }

    // /api/providers/:id/test
    if (action === 'test') {
      if (req.method !== 'POST') throw methodNotAllowed(req.method)
      let overrides: { baseUrl?: string; modelId?: string; apiFormat?: string } | undefined
      try {
        const body = await req.json()
        if (body && typeof body === 'object') overrides = body as typeof overrides
      } catch {
        /* no body is fine — uses saved values */
      }
      const result = await providerService.testProvider(id, overrides)
      return Response.json({ result })
    }

    // /api/providers/:id
    if (req.method === 'GET') {
      const provider = await providerService.getProvider(id)
      return Response.json({ provider: sanitizeProvider(provider) })
    }
    if (req.method === 'PUT') {
      const body = await parseJsonBody(req)
      const input = validateUpdateInput(body)
      const provider = await providerService.updateProvider(id, input)
      return Response.json({ provider: sanitizeProvider(provider) })
    }
    if (req.method === 'DELETE') {
      await providerService.deleteProvider(id)
      return Response.json({ ok: true })
    }

    throw methodNotAllowed(req.method)
  } catch (error) {
    return errorResponse(error)
  }
}
