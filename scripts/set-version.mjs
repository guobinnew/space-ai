#!/usr/bin/env node
/**
 * 统一修改项目版本号
 *
 * 用法: node scripts/set-version.mjs <version>
 *   例如: node scripts/set-version.mjs 1.0.0
 *
 * 更新文件:
 *   - package.json (root)
 *   - server/package.json
 *   - desktop/package.json
 *   - desktop/src-tauri/Cargo.toml
 *   - desktop/src-tauri/tauri.conf.json
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const version = process.argv[2]
if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error('用法: node scripts/set-version.mjs <version>  (例如: 1.0.0)')
  process.exit(1)
}

const files = [
  // [文件路径, 更新函数]
  [resolve(root, 'package.json'), (content) => {
    const json = JSON.parse(content)
    const old = json.version
    json.version = version
    return [JSON.stringify(json, null, 2) + '\n', old]
  }],
  [resolve(root, 'server/package.json'), (content) => {
    const json = JSON.parse(content)
    const old = json.version
    json.version = version
    return [JSON.stringify(json, null, 2) + '\n', old]
  }],
  [resolve(root, 'desktop/package.json'), (content) => {
    const json = JSON.parse(content)
    const old = json.version
    json.version = version
    return [JSON.stringify(json, null, 2) + '\n', old]
  }],
  [resolve(root, 'desktop/src-tauri/tauri.conf.json'), (content) => {
    const json = JSON.parse(content)
    const old = json.version
    json.version = version
    return [JSON.stringify(json, null, 2) + '\n', old]
  }],
  [resolve(root, 'desktop/src-tauri/Cargo.toml'), (content) => {
    const match = content.match(/^version\s*=\s*"([^"]+)"/m)
    const old = match ? match[1] : '?'
    const updated = content.replace(/^version\s*=\s*"[^"]*"/m, `version = "${version}"`)
    return [updated, old]
  }],
]

console.log(`\n  设置版本号 → ${version}\n`)

for (const [filePath, updateFn] of files) {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const [newContent, oldVersion] = updateFn(content)
    writeFileSync(filePath, newContent, 'utf-8')
    const rel = filePath.replace(root + '/', '')
    console.log(`  ✓ ${rel}  ${oldVersion} → ${version}`)
  } catch (err) {
    const rel = filePath.replace(root + '/', '')
    console.error(`  ✗ ${rel}  ${err.message}`)
  }
}

console.log()
