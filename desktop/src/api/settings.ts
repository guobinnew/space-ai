/**
 * Settings API client — 通用设置
 *
 * 通用设置统一存储在服务端 ~/.spaceai/settings.json，
 * 前端不再使用 localStorage 持久化通用设置。
 */

import { api } from './client'

export interface WebSearchConfig {
  provider: 'zhipu' | 'none'
  apiKey: string
}

export interface GeneralSettings {
  theme: 'dark' | 'light'
  locale: 'zh' | 'en'
  defaultWorkDir: string
  notifyOnCompletion: boolean
  webSearch: WebSearchConfig
}

type SettingsResponse = { settings: GeneralSettings }

export const settingsApi = {
  get() {
    return api.get<SettingsResponse>('/api/settings')
  },

  update(partial: Partial<GeneralSettings>) {
    return api.put<SettingsResponse>('/api/settings', partial)
  },
}
