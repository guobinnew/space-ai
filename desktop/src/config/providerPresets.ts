/**
 * Provider presets (frontend)
 *
 * 参照 smart-code config/providerPresets.ts 复刻。
 */

import type { ProviderPreset } from '../types/provider'

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/anthropic',
    apiFormat: 'anthropic',
    defaultModels: { main: 'deepseek-v4-pro' },
    defaultCapabilities: { imageInput: false },
    needsApiKey: true,
    websiteUrl: 'https://platform.deepseek.com',
  },
  {
    id: 'zhipuglm',
    name: 'Zhipu GLM',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    apiFormat: 'anthropic',
    defaultModels: { main: 'glm-5.1' },
    defaultCapabilities: { imageInput: true },
    needsApiKey: true,
    websiteUrl: 'https://open.bigmodel.cn',
  },
  {
    id: 'qwen',
    name: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiFormat: 'openai',
    defaultModels: { main: 'qwen3.7-max' },
    defaultCapabilities: { imageInput: true },
    needsApiKey: true,
    websiteUrl: 'https://help.aliyun.com/zh/model-studio',
  },
  {
    id: 'mimo',
    name: 'Mimo',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    apiFormat: 'openai',
    defaultModels: { main: 'mimo-v2.5-pro' },
    defaultCapabilities: { imageInput: true },
    needsApiKey: true,
    websiteUrl: 'https://mimo.mi.com/',
  },
  {
    id: 'kimi',
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    apiFormat: 'openai',
    defaultModels: { main: 'kimi-k3' },
    defaultCapabilities: { imageInput: true },
    needsApiKey: true,
    websiteUrl: 'https://platform.kimi.com',
  },
  {
    id: 'custom',
    name: 'Custom',
    baseUrl: '',
    apiFormat: 'anthropic',
    defaultModels: { main: '' },
    defaultCapabilities: { imageInput: false },
    needsApiKey: true,
    websiteUrl: '',
  },
]
