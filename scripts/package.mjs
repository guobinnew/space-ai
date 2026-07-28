/**
 * 安装包打包脚本
 *
 * 运行 Tauri build 并将安装包复制到项目根目录 release/ 下。
 * Windows: NSIS .exe | macOS: .dmg
 */

import { execSync } from 'child_process'
import { readdirSync, copyFileSync, mkdirSync, existsSync, statSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DESKTOP = path.join(ROOT, 'desktop')
const BUNDLE_DIR = path.join(DESKTOP, 'src-tauri', 'target', 'release', 'bundle')
const RELEASE_DIR = path.join(ROOT, 'release')

const platform = process.platform // 'win32' | 'darwin' | 'linux'

function findFiles(dir, ext) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => ({
      name: f,
      path: path.join(dir, f),
      mtime: statSync(path.join(dir, f)).mtime,
    }))
    .sort((a, b) => b.mtime - a.mtime) // newest first
}

function copyLatest(dir, ext, destDir) {
  const files = findFiles(dir, ext)
  if (files.length === 0) {
    console.log(`  ⚠ 未找到 ${ext} 文件于 ${dir}`)
    return null
  }
  const latest = files[0]
  const dest = path.join(destDir, latest.name)
  copyFileSync(latest.path, dest)
  const sizeMB = (statSync(latest.path).size / 1024 / 1024).toFixed(1)
  console.log(`  ✓ ${latest.name} (${sizeMB} MB)`)
  return dest
}

// ─── Main ───

console.log('═══ 安装包打包 ═══\n')

// 1. 构建
console.log('1. 构建 Tauri 应用...')
try {
  execSync('npx tauri build', {
    cwd: DESKTOP,
    stdio: 'inherit',
    shell: true,
  })
} catch {
  console.error('\n✗ 构建失败')
  process.exit(1)
}

// 2. 复制安装包
console.log('\n2. 复制安装包到 release/...')
mkdirSync(RELEASE_DIR, { recursive: true })

let copied = 0

if (platform === 'win32') {
  // NSIS installer
  const nsisDir = path.join(BUNDLE_DIR, 'nsis')
  if (copyLatest(nsisDir, '.exe', RELEASE_DIR)) copied++
  // MSI installer (if generated)
  const msiDir = path.join(BUNDLE_DIR, 'msi')
  if (copyLatest(msiDir, '.msi', RELEASE_DIR)) copied++
} else if (platform === 'darwin') {
  // DMG
  const dmgDir = path.join(BUNDLE_DIR, 'dmg')
  if (copyLatest(dmgDir, '.dmg', RELEASE_DIR)) copied++
  // .app bundle zip (if generated)
  const macosDir = path.join(BUNDLE_DIR, 'macos')
  if (copyLatest(macosDir, '.app.tar.gz', RELEASE_DIR)) copied++
} else {
  // Linux: AppImage / deb
  const appimageDir = path.join(BUNDLE_DIR, 'appimage')
  if (copyLatest(appimageDir, '.AppImage', RELEASE_DIR)) copied++
  const debDir = path.join(BUNDLE_DIR, 'deb')
  if (copyLatest(debDir, '.deb', RELEASE_DIR)) copied++
}

if (copied > 0) {
  console.log(`\n✓ 打包完成！安装包位于: ${RELEASE_DIR}`)
} else {
  console.log('\n⚠ 未找到安装包，请检查构建输出')
  console.log(`  期望路径: ${BUNDLE_DIR}`)
}
