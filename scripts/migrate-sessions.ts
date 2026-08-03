/**
 * 一次性迁移脚本：把旧 <id>.jsonl 单文件会话转换为新的目录结构。
 *
 * 用法：
 *   bun run scripts/migrate-sessions.ts             # 默认 ~/.spaceai/sessions
 *   SPACEAI_CONFIG_DIR=/path/to/dir bun run scripts/migrate-sessions.ts
 *
 * 行为：
 *   1. 扫描 sessions 目录下所有 *.jsonl 单文件（非目录）
 *   2. 对每个 session 调用 sessionService.migrateAllLegacySessions
 *   3. 旧 jsonl 按 timestamp 本地日期切分到对应 <YYYY-MM-DD>.jsonl
 *   4. 写 manifest.json（含 messageCount 与 compactedThroughDate: null）
 *   5. **删除原 jsonl 单文件**
 *   6. 输出每个 session 的迁移统计（天数、消息数、原文件大小）
 *
 * 安全性：
 *   - 不修改已迁移过的目录结构（只对存在旧 <id>.jsonl 的 session 操作）
 *   - 已存在新目录的 session 跳过
 *   - 损坏的旧 jsonl（无 session-meta）会被删除
 */

import { sessionService } from '../server/agent/services/sessionService'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'

async function main() {
  const configDir = process.env.SPACEAI_CONFIG_DIR || path.join(os.homedir(), '.spaceai')
  const sessionsDir = path.join(configDir, 'sessions')

  console.log('=== SpaceAI 旧会话记录迁移工具 ===')
  console.log(`配置目录: ${configDir}`)
  console.log(`会话目录: ${sessionsDir}`)
  console.log('')

  // 列出旧 jsonl 单文件
  let entries: fsSync.Dirent[]
  try {
    entries = await fs.readdir(sessionsDir, { withFileTypes: true })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('会话目录不存在，无需迁移。')
      return
    }
    throw err
  }
  const legacyFiles = entries.filter(
    (e) => e.isFile() && e.name.endsWith('.jsonl'),
  )

  if (legacyFiles.length === 0) {
    console.log('未发现旧 <id>.jsonl 单文件，无需迁移。')
    return
  }

  console.log(`发现 ${legacyFiles.length} 个旧会话文件，开始迁移：`)
  console.log('')

  // 批量迁移
  const migrated = await sessionService.migrateAllLegacySessions()

  console.log('')
  console.log('=== 迁移完成 ===')
  console.log(`成功迁移: ${migrated.length} 个会话`)
  for (const id of migrated) {
    const dir = path.join(sessionsDir, id)
    const subEntries = await fs.readdir(dir).catch(() => [])
    const days = subEntries.filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
    console.log(`  ✓ ${id}: ${days.length} 个按天文件`)
  }

  // 失败的会话（理论上 migrateAllLegacySessions 已 catch）
  const failedCount = legacyFiles.length - migrated.length
  if (failedCount > 0) {
    console.log(`失败: ${failedCount} 个会话（详见上方错误日志）`)
  }

  // 验证旧 jsonl 单文件已全部删除
  const afterEntries = await fs.readdir(sessionsDir).catch(() => [])
  const remaining = afterEntries.filter(
    (f) => fsSync.statSync(path.join(sessionsDir, f)).isFile() && f.endsWith('.jsonl'),
  )
  if (remaining.length > 0) {
    console.log('')
    console.log('警告: 以下旧 jsonl 单文件未能删除（可能损坏无 meta）：')
    for (const f of remaining) console.log(`  ! ${f}`)
  }
}

main().catch((err) => {
  console.error('迁移失败：', err)
  process.exit(1)
})
