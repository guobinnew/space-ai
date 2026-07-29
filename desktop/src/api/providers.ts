/**
 * Providers API client
 *
 * 参照 smart-code api/providers.ts 复刻。
 */

import { api, getBaseUrl } from './client'
import type {
  SavedProvider,
  CreateProviderInput,
  UpdateProviderInput,
  TestProviderConfigInput,
  ProviderTestResult,
  ProviderPreset,
} from '../types/provider'

type ProvidersResponse = { providers: SavedProvider[]; defaultId: string | null }
type ProviderResponse = { provider: SavedProvider }
type PresetsResponse = { presets: ProviderPreset[] }
type TestResultResponse = { result: ProviderTestResult }
type AuthStatusResponse = {
  hasAuth: boolean
  source: 'spaceai-provider' | 'env' | 'none'
  activeProvider?: string
}

export const providersApi = {
  list() {
    return api.get<ProvidersResponse>('/api/providers')
  },

  presets() {
    return api.get<PresetsResponse>('/api/providers/presets')
  },

  authStatus() {
    return api.get<AuthStatusResponse>('/api/providers/auth-status')
  },

  create(input: CreateProviderInput) {
    return api.post<ProviderResponse>('/api/providers', input)
  },

  update(id: string, input: UpdateProviderInput) {
    return api.put<ProviderResponse>(`/api/providers/${encodeURIComponent(id)}`, input)
  },

  delete(id: string) {
    return api.delete<{ ok: true }>(`/api/providers/${encodeURIComponent(id)}`)
  },

  setDefault(id: string) {
    return api.post<{ ok: true }>(`/api/providers/${encodeURIComponent(id)}/set-default`)
  },

  getDefault() {
    return api.get<{ provider: SavedProvider | null }>('/api/providers/default')
  },

  test(id: string, overrides?: { baseUrl?: string; modelId?: string; apiFormat?: string }) {
    return api.post<TestResultResponse>(`/api/providers/${encodeURIComponent(id)}/test`, overrides)
  },

  testConfig(input: TestProviderConfigInput) {
    return api.post<TestResultResponse>('/api/providers/test', input)
  },

  testTts(id: string): Promise<{ ok: boolean; blob?: Blob; latencyMs?: number; error?: string }> {
    const baseUrl = getBaseUrl()
    return fetch(`${baseUrl}/api/providers/${encodeURIComponent(id)}/test-tts`, { method: 'POST' }).then(async (res) => {
      if (res.ok) {
        const blob = await res.blob()
        const latencyMs = parseInt(res.headers.get('X-TTS-Latency') || '0', 10)
        return { ok: true, blob, latencyMs }
      }
      const json = await res.json().catch(() => ({ result: { error: `HTTP ${res.status}` } }))
      return { ok: false, error: json?.result?.error || `HTTP ${res.status}` }
    })
  },
}
