/**
 * Provider presets
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
    defaultModels: { main: 'deepseek-chat', haiku: 'deepseek-chat', sonnet: 'deepseek-chat', opus: 'deepseek-chat' },
    defaultCapabilities: { imageInput: false },
    needsApiKey: true,
    websiteUrl: 'https://platform.deepseek.com',
  },
  {
    id: 'zhipuglm',
    name: 'Zhipu GLM',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    apiFormat: 'anthropic',
    defaultModels: { main: 'glm-4-plus', haiku: 'glm-4-plus', sonnet: 'glm-4-plus', opus: 'glm-4-plus' },
    defaultCapabilities: { imageInput: true },
    needsApiKey: true,
    websiteUrl: 'https://open.bigmodel.cn',
  },
  {
    id: 'kimi',
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/anthropic',
    apiFormat: 'anthropic',
    defaultModels: { main: 'moonshot-v1-8k', haiku: 'moonshot-v1-8k', sonnet: 'moonshot-v1-8k', opus: 'moonshot-v1-8k' },
    defaultCapabilities: { imageInput: false },
    needsApiKey: true,
    websiteUrl: 'https://platform.moonshot.cn',
  },
  {
    id: 'qwen',
    name: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiFormat: 'openai_chat',
    defaultModels: { main: 'qwen-plus', haiku: 'qwen-plus', sonnet: 'qwen-plus', opus: 'qwen-plus' },
    defaultCapabilities: { imageInput: true },
    needsApiKey: true,
    websiteUrl: 'https://help.aliyun.com/zh/model-studio',
  },
  {
    id: 'custom',
    name: 'Custom',
    baseUrl: '',
    apiFormat: 'anthropic',
    defaultModels: { main: '', haiku: '', sonnet: '', opus: '' },
    defaultCapabilities: { imageInput: false },
    needsApiKey: true,
    websiteUrl: '',
  },
]
