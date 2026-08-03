/**
 * settingService 单元测试。
 *
 * 覆盖：
 *   - 首次读取（文件不存在）返回默认值
 *   - 部分字段更新（不覆盖 env 等其他字段）
 *   - 全字段类型校验（非法值忽略）
 *   - 写入后再读出一致
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { settingService } from '../services/settingService'
import {
  setupTempConfig,
  teardownTempConfig,
  writeTempFile,
  readTempFile,
  tempFileExists,
} from './testHelpers'

beforeEach(async () => {
  await setupTempConfig('spaceai-setting-test-')
})

afterEach(async () => {
  await teardownTempConfig()
})

describe('settingService - getGeneralSettings', () => {
  test('settings.json 不存在时返回默认值', async () => {
    const s = await settingService.getGeneralSettings()
    expect(s.theme).toBe('dark')
    expect(s.locale).toBe('zh')
    expect(s.defaultWorkDir).toBe('')
    expect(s.notifyOnCompletion).toBe(false)
    expect(s.webSearch).toEqual({ provider: 'none', apiKey: '' })
  })

  test('合法字段正确读取', async () => {
    await writeTempFile('settings.json', JSON.stringify({
      theme: 'light',
      locale: 'en',
      defaultWorkDir: 'D:\\Work',
      notifyOnCompletion: true,
      webSearch: { provider: 'zhipu', apiKey: 'abc123' },
    }))
    const s = await settingService.getGeneralSettings()
    expect(s.theme).toBe('light')
    expect(s.locale).toBe('en')
    expect(s.defaultWorkDir).toBe('D:\\Work')
    expect(s.notifyOnCompletion).toBe(true)
    expect(s.webSearch).toEqual({ provider: 'zhipu', apiKey: 'abc123' })
  })

  test('非法 theme 值回退到默认 dark', async () => {
    await writeTempFile('settings.json', JSON.stringify({ theme: 'purple' }))
    const s = await settingService.getGeneralSettings()
    expect(s.theme).toBe('dark')
  })

  test('非法 locale 值回退到默认 zh', async () => {
    await writeTempFile('settings.json', JSON.stringify({ locale: 'fr' }))
    const s = await settingService.getGeneralSettings()
    expect(s.locale).toBe('zh')
  })

  test('非法 notifyOnCompletion 类型回退到默认 false', async () => {
    await writeTempFile('settings.json', JSON.stringify({ notifyOnCompletion: 'yes' }))
    const s = await settingService.getGeneralSettings()
    expect(s.notifyOnCompletion).toBe(false)
  })

  test('非法 webSearch.provider 回退到 none', async () => {
    await writeTempFile('settings.json', JSON.stringify({
      webSearch: { provider: 'google', apiKey: 'x' },
    }))
    const s = await settingService.getGeneralSettings()
    expect(s.webSearch.provider).toBe('none')
    expect(s.webSearch.apiKey).toBe('x') // apiKey 类型仍合法，保留
  })

  test('字段值为 null 时忽略并使用默认', async () => {
    await writeTempFile('settings.json', JSON.stringify({
      theme: null,
      locale: 'en',
    }))
    const s = await settingService.getGeneralSettings()
    expect(s.theme).toBe('dark')
    expect(s.locale).toBe('en')
  })
})

describe('settingService - updateGeneralSettings', () => {
  test('部分字段更新（其他字段保留）', async () => {
    await writeTempFile('settings.json', JSON.stringify({
      theme: 'dark',
      locale: 'zh',
      defaultWorkDir: 'D:\\Old',
      notifyOnCompletion: false,
      env: { ANTHROPIC_API_KEY: 'secret' }, // 由 providerService 维护，不应被覆盖
    }))

    const updated = await settingService.updateGeneralSettings({
      theme: 'light',
      defaultWorkDir: 'D:\\New',
    })
    expect(updated.theme).toBe('light')
    expect(updated.defaultWorkDir).toBe('D:\\New')
    expect(updated.locale).toBe('zh') // 未传字段保留旧值
    expect(updated.notifyOnCompletion).toBe(false)

    // env 字段必须保留
    const raw = JSON.parse(await readTempFile('settings.json'))
    expect(raw.env).toEqual({ ANTHROPIC_API_KEY: 'secret' })
    expect(raw.theme).toBe('light')
    expect(raw.defaultWorkDir).toBe('D:\\New')
    expect(raw.locale).toBe('zh')
  })

  test('settings.json 不存在时直接创建', async () => {
    const updated = await settingService.updateGeneralSettings({
      theme: 'light',
      notifyOnCompletion: true,
    })
    expect(updated.theme).toBe('light')
    expect(updated.notifyOnCompletion).toBe(true)
    expect(updated.locale).toBe('zh') // 默认值
    expect(tempFileExists('settings.json')).toBe(true)
  })

  test('webSearch 单字段部分更新', async () => {
    await writeTempFile('settings.json', JSON.stringify({
      webSearch: { provider: 'none', apiKey: '' },
    }))
    const updated = await settingService.updateGeneralSettings({
      webSearch: { provider: 'zhipu', apiKey: 'my-key' },
    })
    expect(updated.webSearch).toEqual({ provider: 'zhipu', apiKey: 'my-key' })
    const raw = JSON.parse(await readTempFile('settings.json'))
    expect(raw.webSearch).toEqual({ provider: 'zhipu', apiKey: 'my-key' })
  })

  test('传 undefined 字段时跳过（不写 undefined 到文件）', async () => {
    await writeTempFile('settings.json', JSON.stringify({ theme: 'dark' }))
    // @ts-expect-error 测试运行时不存在的字段
    const updated = await settingService.updateGeneralSettings({ unknownField: 'x' })
    const raw = JSON.parse(await readTempFile('settings.json'))
    expect(raw.unknownField).toBeUndefined()
    expect(updated.theme).toBe('dark')
  })
})
