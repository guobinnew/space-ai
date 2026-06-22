/**
 * Provider type definitions (frontend)
 *
 * 参照 smart-code types/provider.ts 复刻。
 */

export type ApiFormat = 'anthropic' | 'openai'

export type ModelMapping = {
  main: string
}

export type ModelCapabilities = {
  imageInput?: boolean
}

export type SavedProvider = {
  id: string
  presetId: string
  name: string
  apiKey: string  // masked from server
  baseUrl: string
  apiFormat: ApiFormat
  models: ModelMapping
  capabilities?: ModelCapabilities
  notes?: string
}

export type CreateProviderInput = {
  presetId: string
  name: string
  apiKey: string
  baseUrl: string
  apiFormat?: ApiFormat
  models: ModelMapping
  capabilities?: ModelCapabilities
  notes?: string
}

export type UpdateProviderInput = {
  name?: string
  apiKey?: string
  baseUrl?: string
  apiFormat?: ApiFormat
  models?: ModelMapping
  capabilities?: ModelCapabilities
  notes?: string
}

export type TestProviderConfigInput = {
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
