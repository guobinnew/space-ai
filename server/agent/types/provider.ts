/**
 * Provider type definitions
 *
 * 参照 smart-code types/provider.ts 复刻。
 */

export type ApiFormat = 'anthropic' | 'openai'

export type ModelMapping = {
  main: string
  tts?: string
}

export type ModelCapabilities = {
  imageInput?: boolean
}

export type SavedProvider = {
  id: string
  presetId: string
  name: string
  apiKey: string
  baseUrl: string
  ttsBaseUrl?: string
  apiFormat: ApiFormat
  models: ModelMapping
  capabilities?: ModelCapabilities
  notes?: string
}

export type ProvidersIndex = {
  activeId: string | null
  providers: SavedProvider[]
}

export type CreateProviderInput = {
  presetId: string
  name: string
  apiKey: string
  baseUrl: string
  ttsBaseUrl?: string
  apiFormat?: ApiFormat
  models: ModelMapping
  capabilities?: ModelCapabilities
  notes?: string
}

export type UpdateProviderInput = {
  name?: string
  apiKey?: string
  baseUrl?: string
  ttsBaseUrl?: string
  apiFormat?: ApiFormat
  models?: ModelMapping
  capabilities?: ModelCapabilities
  notes?: string
}

export type TestProviderInput = {
  baseUrl: string
  apiKey: string
  modelId: string
  apiFormat?: ApiFormat
}

export type ProviderTestStepResult = {
  success: boolean
  latencyMs: number
  error?: string
  modelUsed?: string
  httpStatus?: number
}

export type ProviderTestResult = {
  connectivity: ProviderTestStepResult
  proxy?: ProviderTestStepResult
}

export type ProviderPreset = {
  id: string
  name: string
  baseUrl: string
  apiFormat: ApiFormat
  defaultModels: ModelMapping
  defaultCapabilities?: ModelCapabilities
  needsApiKey: boolean
  websiteUrl: string
}
