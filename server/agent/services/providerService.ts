/**
 * Provider Service — preset-based provider configuration
 *
 * 参照 smart-code services/providerService.ts 复刻，简化版。
 *
 * Storage: ~/.smartspace/providers.json (lightweight index)
 * Active provider env vars written to ~/.smartspace/settings.json
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { ApiError } from '../middleware/errorHandler'
import type {
  SavedProvider,
  ProvidersIndex,
  CreateProviderInput,
  UpdateProviderInput,
  TestProviderInput,
  ProviderTestResult,
  ProviderTestStepResult,
  ApiFormat,
} from '../types/provider'

const DEFAULT_INDEX: ProvidersIndex = { activeId: null, providers: [] }

export class ProviderService {
  private getConfigDir(): string {
    return process.env.SMARTSPACE_CONFIG_DIR || path.join(os.homedir(), '.smartspace')
  }

  private getIndexPath(): string {
    return path.join(this.getConfigDir(), 'providers.json')
  }

  private getSettingsPath(): string {
    return path.join(this.getConfigDir(), 'settings.json')
  }

  private async ensureConfigDir(): Promise<void> {
    await fs.mkdir(this.getConfigDir(), { recursive: true })
  }

  private async readIndex(): Promise<ProvidersIndex> {
    try {
      const raw = await fs.readFile(this.getIndexPath(), 'utf-8')
      return JSON.parse(raw) as ProvidersIndex
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { ...DEFAULT_INDEX, providers: [] }
      }
      throw ApiError.internal(`Failed to read providers index: ${err}`)
    }
  }

  private async writeIndex(index: ProvidersIndex): Promise<void> {
    await this.ensureConfigDir()
    await fs.writeFile(this.getIndexPath(), JSON.stringify(index, null, 2), 'utf-8')
  }

  private async readSettings(): Promise<Record<string, unknown>> {
    try {
      const raw = await fs.readFile(this.getSettingsPath(), 'utf-8')
      return JSON.parse(raw) as Record<string, unknown>
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
      throw ApiError.internal(`Failed to read settings.json: ${err}`)
    }
  }

  private async writeSettings(settings: Record<string, unknown>): Promise<void> {
    await this.ensureConfigDir()
    await fs.writeFile(this.getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
  }

  // --- CRUD ---

  async listProviders(): Promise<{ providers: SavedProvider[]; activeId: string | null }> {
    const index = await this.readIndex()
    return { providers: index.providers, activeId: index.activeId }
  }

  async getProvider(id: string): Promise<SavedProvider> {
    const index = await this.readIndex()
    const provider = index.providers.find((p) => p.id === id)
    if (!provider) throw ApiError.notFound(`Provider not found: ${id}`)
    return provider
  }

  async addProvider(input: CreateProviderInput): Promise<SavedProvider> {
    const index = await this.readIndex()

    const provider: SavedProvider = {
      id: crypto.randomUUID(),
      presetId: input.presetId,
      name: input.name,
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      apiFormat: input.apiFormat ?? 'anthropic',
      models: input.models,
      ...(input.capabilities !== undefined && { capabilities: input.capabilities }),
      ...(input.notes !== undefined && { notes: input.notes }),
    }

    index.providers.push(provider)
    await this.writeIndex(index)
    return provider
  }

  async updateProvider(id: string, input: UpdateProviderInput): Promise<SavedProvider> {
    const index = await this.readIndex()
    const idx = index.providers.findIndex((p) => p.id === id)
    if (idx === -1) throw ApiError.notFound(`Provider not found: ${id}`)

    const existing = index.providers[idx]
    const updated: SavedProvider = {
      ...existing,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.apiKey !== undefined && { apiKey: input.apiKey }),
      ...(input.baseUrl !== undefined && { baseUrl: input.baseUrl }),
      ...(input.apiFormat !== undefined && { apiFormat: input.apiFormat }),
      ...(input.models !== undefined && { models: input.models }),
      ...(input.capabilities !== undefined && { capabilities: input.capabilities }),
      ...(input.notes !== undefined && { notes: input.notes }),
    }

    index.providers[idx] = updated
    await this.writeIndex(index)

    if (index.activeId === id) {
      await this.syncToSettings(updated)
    }

    return updated
  }

  async deleteProvider(id: string): Promise<void> {
    const index = await this.readIndex()
    const idx = index.providers.findIndex((p) => p.id === id)
    if (idx === -1) throw ApiError.notFound(`Provider not found: ${id}`)

    if (index.activeId === id) {
      throw ApiError.conflict('Cannot delete the active provider. Switch to another provider first.')
    }

    index.providers.splice(idx, 1)
    await this.writeIndex(index)
  }

  // --- Activation ---

  async activateProvider(id: string): Promise<void> {
    const index = await this.readIndex()
    const provider = index.providers.find((p) => p.id === id)
    if (!provider) throw ApiError.notFound(`Provider not found: ${id}`)

    index.activeId = id
    await this.writeIndex(index)
    await this.syncToSettings(provider)
  }

  // --- Settings sync ---

  private async syncToSettings(provider: SavedProvider): Promise<void> {
    const settings = await this.readSettings()
    const existingEnv = (settings.env as Record<string, string>) || {}

    settings.env = {
      ...existingEnv,
      SPACEAI_BASE_URL: provider.baseUrl,
      SPACEAI_AUTH_TOKEN: provider.apiKey,
      SPACEAI_MODEL: provider.models.main,
    }

    await this.writeSettings(settings)
  }

  // --- Auth status ---

  async checkAuthStatus(): Promise<{
    hasAuth: boolean
    source: 'smartspace-provider' | 'env' | 'none'
    activeProvider?: string
  }> {
    const index = await this.readIndex()
    if (index.activeId) {
      const provider = index.providers.find((p) => p.id === index.activeId)
      if (provider?.apiKey) {
        return { hasAuth: true, source: 'smartspace-provider', activeProvider: provider.name }
      }
    }

    if (process.env.SPACEAI_AUTH_TOKEN) {
      return { hasAuth: true, source: 'env' }
    }

    return { hasAuth: false, source: 'none' }
  }

  // --- Test ---

  async testProvider(
    id: string,
    overrides?: { baseUrl?: string; modelId?: string; apiFormat?: string },
  ): Promise<ProviderTestResult> {
    const provider = await this.getProvider(id)
    const baseUrl = overrides?.baseUrl || provider.baseUrl
    const modelId = overrides?.modelId || provider.models.main
    const apiFormat = (overrides?.apiFormat ?? provider.apiFormat ?? 'anthropic') as ApiFormat

    if (!baseUrl || !provider.apiKey) {
      return { connectivity: { success: false, latencyMs: 0, error: 'Missing baseUrl or apiKey' } }
    }
    return this.testProviderConfig({
      baseUrl,
      apiKey: provider.apiKey,
      modelId,
      apiFormat,
    })
  }

  async testProviderConfig(input: TestProviderInput): Promise<ProviderTestResult> {
    const format: ApiFormat = input.apiFormat ?? 'anthropic'
    const base = input.baseUrl.replace(/\/+$/, '')
    const step1 = await this.testConnectivity(base, input.apiKey, input.modelId, format)
    return { connectivity: step1 }
  }

  private async testConnectivity(
    base: string,
    apiKey: string,
    modelId: string,
    format: ApiFormat,
  ): Promise<ProviderTestStepResult> {
    const start = Date.now()
    try {
      const { url, headers, body } = buildDirectTestRequest(base, apiKey, modelId, format)
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      })

      const latencyMs = Date.now() - start
      const resBody = await response.json().catch(() => null) as Record<string, unknown> | null

      if (!response.ok) {
        let error = `HTTP ${response.status}`
        if (resBody?.error && typeof resBody.error === 'object') {
          error = ((resBody.error as Record<string, unknown>).message as string) || error
        }
        return { success: false, latencyMs, error, modelUsed: modelId, httpStatus: response.status }
      }

      const valid = validateResponseBody(resBody, format)
      if (!valid.ok) {
        return { success: false, latencyMs, error: valid.error, modelUsed: modelId, httpStatus: response.status }
      }

      return { success: true, latencyMs, modelUsed: valid.model || modelId, httpStatus: response.status }
    } catch (err: unknown) {
      const latencyMs = Date.now() - start
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        return { success: false, latencyMs, error: 'Request timed out (30s)', modelUsed: modelId }
      }
      return { success: false, latencyMs, error: err instanceof Error ? err.message : String(err), modelUsed: modelId }
    }
  }
}

// ─── Helpers ───────────────────────────────────────────────

function buildDirectTestRequest(
  base: string,
  apiKey: string,
  modelId: string,
  format: ApiFormat,
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  const prompt = 'Say "ok" and nothing else.'

  if (format === 'openai') {
    return {
      url: `${base}/chat/completions`,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: { model: modelId, max_tokens: 16, messages: [{ role: 'user', content: prompt }] },
    }
  }
  // anthropic (default)
  return {
    url: `${base}/v1/messages`,
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: { model: modelId, max_tokens: 16, messages: [{ role: 'user', content: prompt }] },
  }
}

function validateResponseBody(
  body: Record<string, unknown> | null,
  format: ApiFormat,
): { ok: true; model?: string } | { ok: false; error: string } {
  if (!body) return { ok: false, error: 'Empty response — not a valid API endpoint' }
  if (body.error && typeof body.error === 'object') {
    return { ok: false, error: ((body.error as Record<string, unknown>).message as string) || 'Error in response body' }
  }

  if (format === 'openai') {
    if (!Array.isArray(body.choices) || body.choices.length === 0) {
      return { ok: false, error: 'Response missing choices — not a valid Chat Completions endpoint' }
    }
    return { ok: true, model: (body.model as string) || undefined }
  }
  // anthropic
  if (body.type !== 'message' || !Array.isArray(body.content)) {
    return { ok: false, error: 'Not a valid Anthropic Messages endpoint' }
  }
  return { ok: true, model: (body.model as string) || undefined }
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return '****'
  return key.slice(0, 4) + '****' + key.slice(-4)
}

export function sanitizeProvider(provider: SavedProvider): SavedProvider {
  return { ...provider, apiKey: maskApiKey(provider.apiKey) }
}
