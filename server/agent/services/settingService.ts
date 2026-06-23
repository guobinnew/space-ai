/**
 * Setting Service — 通用设置读写
 *
 * 统一管理 ~/.spaceai/settings.json 中的通用设置字段。
 * 与 providerService 的 env 同步共用同一个 settings.json 文件，
 * 采用 read-modify-write 模式，只更新本服务负责的字段，不覆盖其他字段。
 *
 * Storage: ~/.spaceai/settings.json
 *   {
 *     "theme": "dark" | "light",
 *     "locale": "zh" | "en",
 *     "defaultWorkDir": string,
 *     "notifyOnCompletion": boolean,
 *     "env": { ... }   // 由 providerService 维护
 *   }
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { ApiError } from '../middleware/errorHandler'

/** 通用设置字段（由本服务管理） */
export interface GeneralSettings {
  theme: 'dark' | 'light'
  locale: 'zh' | 'en'
  defaultWorkDir: string
  notifyOnCompletion: boolean
}

/** settings.json 中由本服务管理的字段 key 列表 */
const GENERAL_KEYS: (keyof GeneralSettings)[] = [
  'theme',
  'locale',
  'defaultWorkDir',
  'notifyOnCompletion',
]

const DEFAULT_SETTINGS: GeneralSettings = {
  theme: 'dark',
  locale: 'zh',
  defaultWorkDir: '',
  notifyOnCompletion: false,
}

export class SettingService {
  private getConfigDir(): string {
    return process.env.SPACEAI_CONFIG_DIR || path.join(os.homedir(), '.spaceai')
  }

  private getSettingsPath(): string {
    return path.join(this.getConfigDir(), 'settings.json')
  }

  private async ensureConfigDir(): Promise<void> {
    await fs.mkdir(this.getConfigDir(), { recursive: true })
  }

  /** 读取整个 settings.json（所有字段，包含 env 等） */
  private async readAll(): Promise<Record<string, unknown>> {
    try {
      const raw = await fs.readFile(this.getSettingsPath(), 'utf-8')
      return JSON.parse(raw) as Record<string, unknown>
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
      throw ApiError.internal(`Failed to read settings.json: ${err}`)
    }
  }

  /** 写入整个 settings.json */
  private async writeAll(settings: Record<string, unknown>): Promise<void> {
    await this.ensureConfigDir()
    await fs.writeFile(this.getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
  }

  /** 仅读取通用设置字段 */
  async getGeneralSettings(): Promise<GeneralSettings> {
    const all = await this.readAll()
    const result: GeneralSettings = { ...DEFAULT_SETTINGS }
    for (const key of GENERAL_KEYS) {
      const v = all[key]
      if (v !== undefined && v !== null) {
        // 类型校验：只接受合法值
        if (key === 'theme' && (v === 'dark' || v === 'light')) result.theme = v
        else if (key === 'locale' && (v === 'zh' || v === 'en')) result.locale = v
        else if (key === 'defaultWorkDir' && typeof v === 'string') result.defaultWorkDir = v
        else if (key === 'notifyOnCompletion' && typeof v === 'boolean') result.notifyOnCompletion = v
      }
    }
    return result
  }

  /** 部分更新通用设置字段（合并写入，不影响 env 等其他字段） */
  async updateGeneralSettings(partial: Partial<GeneralSettings>): Promise<GeneralSettings> {
    const all = await this.readAll()

    // 应用部分更新（仅本服务管理的字段）
    for (const key of GENERAL_KEYS) {
      if (partial[key] !== undefined) {
        all[key] = partial[key]
      }
    }

    await this.writeAll(all)
    return this.getGeneralSettings()
  }
}

/** 单例 */
export const settingService = new SettingService()
