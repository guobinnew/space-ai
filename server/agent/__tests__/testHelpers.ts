/**
 * 测试辅助：临时配置目录（用于隔离 SPACEAI_CONFIG_DIR）。
 * 每个测试文件 setup 时创建唯一临时目录，teardown 时清理。
 */

import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import * as os from 'os'

let currentTempDir: string | null = null

/** 在测试开始时调用：设置 SPACEAI_CONFIG_DIR 指向唯一临时目录 */
export async function setupTempConfig(prefix = 'spaceai-test-'): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  currentTempDir = dir
  process.env.SPACEAI_CONFIG_DIR = dir
  return dir
}

/** 在测试结束后调用：清理临时目录并恢复 env */
export async function teardownTempConfig(): Promise<void> {
  if (currentTempDir) {
    await fs.rm(currentTempDir, { recursive: true, force: true }).catch(() => {})
    currentTempDir = null
  }
  delete process.env.SPACEAI_CONFIG_DIR
}

/** 在临时目录里直接写一个文件 */
export async function writeTempFile(relativePath: string, content: string): Promise<void> {
  if (!currentTempDir) throw new Error('setupTempConfig must be called first')
  const full = path.join(currentTempDir, relativePath)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, content, 'utf-8')
}

/** 读取临时目录里的文件 */
export async function readTempFile(relativePath: string): Promise<string> {
  if (!currentTempDir) throw new Error('setupTempConfig must be called first')
  const full = path.join(currentTempDir, relativePath)
  return fs.readFile(full, 'utf-8')
}

/** 判断临时目录里某文件是否存在 */
export function tempFileExists(relativePath: string): boolean {
  if (!currentTempDir) throw new Error('setupTempConfig must be called first')
  return fsSync.existsSync(path.join(currentTempDir, relativePath))
}

/** 列出临时目录下某子目录的全部文件名 */
export async function listTempDir(relativePath: string): Promise<string[]> {
  if (!currentTempDir) throw new Error('setupTempConfig must be called first')
  const full = path.join(currentTempDir, relativePath)
  try {
    return await fs.readdir(full)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}
