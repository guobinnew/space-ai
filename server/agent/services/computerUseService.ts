/**
 * ComputerUseService — Python 环境检测 + venv 设置
 *
 * 检测系统 Python，创建 venv，安装依赖（pyautogui, mss, Pillow 等）。
 * 参照 smart-code src/server/api/computer-use-python.ts + computer-use.ts
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const CONFIG_DIR = process.env.SPACEAI_CONFIG_DIR || path.join(os.homedir(), '.spaceai')
const VENV_DIR = path.join(CONFIG_DIR, 'computer-use-venv')
const RUNTIME_DIR = path.join(CONFIG_DIR, 'computer-use-runtime')

// Windows 依赖
const WIN_REQUIREMENTS = [
  'pyautogui>=0.9.54',
  'mss>=9.0.1',
  'Pillow>=10.0.0',
  'pywin32>=306',
  'psutil>=5.9.0',
  'pyperclip>=1.8.2',
  'screeninfo>=0.8.1',
]

// macOS 依赖
const MAC_REQUIREMENTS = [
  'pyautogui>=0.9.54',
  'mss>=9.0.1',
  'Pillow>=10.0.0',
  'pyobjc-core>=10.0',
  'pyobjc-framework-Quartz>=10.0',
  'pyobjc-framework-ApplicationServices>=10.0',
]

type PythonCandidate = {
  command: string
  prefixArgs: string[]
}

function getPythonCandidates(): PythonCandidate[] {
  if (process.platform === 'win32') {
    return [
      { command: 'python3', prefixArgs: [] },
      { command: 'python', prefixArgs: [] },
      { command: 'py', prefixArgs: ['-3'] },
      { command: 'py', prefixArgs: [] },
    ]
  }
  return [{ command: 'python3', prefixArgs: [] }]
}

export type PythonRuntime = {
  installed: boolean
  version: string | null
  path: string | null
  command: string | null
  prefixArgs: string[]
  source: 'system' | 'venv' | null
}

export type ComputerUseStatus = {
  platform: string
  supported: boolean
  python: {
    installed: boolean
    version: string | null
    path: string | null
  }
  venv: {
    created: boolean
    path: string
  }
  dependencies: {
    installed: boolean
    requirementsFound: boolean
  }
  permissions: {
    accessibility: boolean | null
    screenRecording: boolean | null
  }
}

export type SetupStep = {
  name: string
  ok: boolean
  message: string
}

export type SetupResult = {
  success: boolean
  steps: SetupStep[]
}

export type InstalledApp = {
  bundleId: string
  displayName: string
  path: string
}

export type AuthorizedApp = {
  bundleId: string
  displayName: string
  authorizedAt: string
}

export type ComputerUseConfig = {
  authorizedApps: AuthorizedApp[]
  grantFlags: {
    clipboardRead: boolean
    clipboardWrite: boolean
    systemKeyCombos: boolean
  }
}

const DEFAULT_CONFIG: ComputerUseConfig = {
  authorizedApps: [],
  grantFlags: {
    clipboardRead: true,
    clipboardWrite: true,
    systemKeyCombos: true,
  },
}

const CONFIG_FILE = path.join(CONFIG_DIR, 'computer-use-config.json')

/** 运行命令 */
async function runCommand(cmd: string, args: string[], timeoutMs = 30000): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { timeout: timeoutMs, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    return { ok: true, stdout: stdout || '', stderr: stderr || '' }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message: string }
    return { ok: false, stdout: e.stdout || '', stderr: e.stderr || e.message || '' }
  }
}

/** 检测系统 Python */
async function detectPython(venvPythonPath?: string): Promise<PythonRuntime> {
  for (const candidate of getPythonCandidates()) {
    const result = await runCommand(candidate.command, [...candidate.prefixArgs, '--version'])
    if (!result.ok) continue
    const versionMatch = (result.stdout + '\n' + result.stderr).match(/Python\s+([0-9][^\s]*)/i)
    let pyPath: string | null = null
    try {
      const { stdout } = await execFileAsync(process.platform === 'win32' ? 'where' : 'which', [candidate.command])
      pyPath = stdout.trim().split(/\r?\n/)[0] || null
    } catch { /* ignore */ }
    return {
      installed: true,
      version: versionMatch?.[1] || null,
      path: pyPath,
      command: candidate.command,
      prefixArgs: candidate.prefixArgs,
      source: 'system',
    }
  }

  // 检查 venv
  if (venvPythonPath) {
    const result = await runCommand(venvPythonPath, ['--version'])
    if (result.ok) {
      const versionMatch = (result.stdout + '\n' + result.stderr).match(/Python\s+([0-9][^\s]*)/i)
      return {
        installed: true,
        version: versionMatch?.[1] || null,
        path: venvPythonPath,
        command: venvPythonPath,
        prefixArgs: [],
        source: 'venv',
      }
    }
  }

  return { installed: false, version: null, path: null, command: null, prefixArgs: [], source: null }
}

/** 获取 venv 中的 Python 路径 */
function getVenvPython(): string {
  if (process.platform === 'win32') {
    return path.join(VENV_DIR, 'Scripts', 'python.exe')
  }
  return path.join(VENV_DIR, 'bin', 'python')
}

/** 检查 venv 是否存在且依赖已安装 */
async function checkVenvReady(): Promise<boolean> {
  const venvPython = getVenvPython()
  try {
    await fs.access(venvPython)
  } catch {
    return false
  }
  // 检查关键依赖
  const result = await runCommand(venvPython, ['-c', 'import pyautogui, mss, PIL; print("ok")'])
  return result.ok && result.stdout.trim() === 'ok'
}

/** 获取状态 */
export async function getStatus(): Promise<ComputerUseStatus> {
  const platform = process.platform
  const supported = platform === 'win32' || platform === 'darwin'
  const venvPython = getVenvPython()
  const python = await detectPython(venvPython)
  const venvCreated = await checkVenvExists()
  const depsInstalled = venvCreated && await checkVenvReady()

  return {
    platform,
    supported,
    python: {
      installed: python.installed,
      version: python.version,
      path: python.path,
    },
    venv: {
      created: venvCreated,
      path: VENV_DIR,
    },
    dependencies: {
      installed: depsInstalled,
      requirementsFound: true,
    },
    permissions: {
      accessibility: platform === 'win32' ? true : null,
      screenRecording: platform === 'win32' ? true : null,
    },
  }
}

/** 检查 venv 是否存在（不检查依赖） */
async function checkVenvExists(): Promise<boolean> {
  const venvPython = getVenvPython()
  try {
    await fs.access(venvPython)
    return true
  } catch {
    return false
  }
}

/** 安装设置：创建 venv + 安装依赖 */
export async function runSetup(): Promise<SetupResult> {
  const platform = process.platform
  const steps: SetupStep[] = []

  if (platform !== 'win32' && platform !== 'darwin') {
    steps.push({ name: 'platform', ok: false, message: `不支持的平台: ${platform}` })
    return { success: false, steps }
  }

  // Step 1: 检测系统 Python
  const python = await detectPython()
  if (!python.installed || !python.command) {
    steps.push({ name: 'python_check', ok: false, message: '未检测到 Python，请先安装 Python 3.8+ 并添加到 PATH' })
    return { success: false, steps }
  }
  steps.push({
    name: 'python_check',
    ok: true,
    message: python.source === 'venv'
      ? `Python ${python.version}（使用现有虚拟环境）`
      : `Python ${python.version}`,
  })

  const pythonCmd = python.command
  const pythonArgs = python.prefixArgs

  // Step 2: 部署 helper 脚本
  try {
    await deployHelperScript()
    steps.push({ name: 'runtime_files', ok: true, message: '运行时文件已就绪' })
  } catch (err) {
    steps.push({ name: 'runtime_files', ok: false, message: `提取运行时文件失败: ${err instanceof Error ? err.message : String(err)}` })
    return { success: false, steps }
  }

  // Step 3: 创建 venv
  const venvExists = await checkVenvExists()
  if (!venvExists) {
    try {
      await fs.mkdir(CONFIG_DIR, { recursive: true })
      const venvResult = await runCommand(pythonCmd, [...pythonArgs, '-m', 'venv', VENV_DIR], 120000)
      if (!venvResult.ok) {
        steps.push({ name: 'venv', ok: false, message: `创建虚拟环境失败: ${venvResult.stderr}` })
        return { success: false, steps }
      }
      steps.push({ name: 'venv', ok: true, message: '虚拟环境已创建' })
    } catch (err) {
      steps.push({ name: 'venv', ok: false, message: `创建 venv 失败: ${err instanceof Error ? err.message : String(err)}` })
      return { success: false, steps }
    }
  } else {
    steps.push({ name: 'venv', ok: true, message: '虚拟环境已存在' })
  }

  // Step 4: 安装依赖
  const venvPython = getVenvPython()
  const requirements = platform === 'win32' ? WIN_REQUIREMENTS : MAC_REQUIREMENTS

  const reqFile = path.join(RUNTIME_DIR, 'requirements.txt')
  await fs.mkdir(RUNTIME_DIR, { recursive: true })
  await fs.writeFile(reqFile, requirements.join('\n') + '\n', 'utf-8')

  const pipInstallResult = await runCommand(venvPython, [
    '-m', 'pip', 'install',
    '-i', 'https://pypi.tuna.tsinghua.edu.cn/simple',
    '--trusted-host', 'pypi.tuna.tsinghua.edu.cn',
    ...requirements,
  ], 300000)

  if (!pipInstallResult.ok) {
    steps.push({ name: 'deps', ok: false, message: `安装依赖失败: ${pipInstallResult.stderr.slice(0, 500)}` })
    return { success: false, steps }
  }
  steps.push({ name: 'deps', ok: true, message: '依赖已安装' })

  // Step 5: 验证
  const verifyResult = await runCommand(venvPython, ['-c', 'import pyautogui, mss, PIL; print("ok")'])
  if (!verifyResult.ok || verifyResult.stdout.trim() !== 'ok') {
    steps.push({ name: 'verify', ok: false, message: '依赖验证失败' })
    return { success: false, steps }
  }
  steps.push({ name: 'verify', ok: true, message: '环境验证通过' })

  return { success: true, steps }
}

/** 部署平台对应的 Python helper 脚本 */
async function deployHelperScript(): Promise<void> {
  const platform = process.platform
  const scriptName = platform === 'win32' ? 'win_helper.py' : 'mac_helper.py'
  await fs.mkdir(RUNTIME_DIR, { recursive: true })

  // 从源码目录复制 helper 脚本到 runtime 目录
  const sourcePath = path.join(__dirname, '..', 'runtime', scriptName)
  const destPath = path.join(RUNTIME_DIR, scriptName)
  try {
    const content = await fs.readFile(sourcePath, 'utf-8')
    await fs.writeFile(destPath, content, 'utf-8')
  } catch (err) {
    console.error('[ComputerUse] Failed to deploy helper script:', err)
  }
}

/** 获取 venv Python 路径（供工具执行器使用） */
export function getVenvPythonPath(): string {
  return getVenvPython()
}

/** 获取 runtime 目录路径 */
export function getRuntimeDir(): string {
  return RUNTIME_DIR
}

/** 调用 Python helper 执行命令 */
export async function callPythonHelper(action: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const venvPython = getVenvPythonPath()
  const helperScript = path.join(RUNTIME_DIR, process.platform === 'win32' ? 'win_helper.py' : 'mac_helper.py')

  const input = JSON.stringify({ action, params })
  const result = await runCommand(venvPython, [helperScript, input])

  if (!result.ok) {
    throw new Error(`Python helper error: ${result.stderr || result.stdout || 'unknown'}`)
  }

  try {
    return JSON.parse(result.stdout)
  } catch {
    return { raw: result.stdout }
  }
}

/** 列出系统已安装的应用 */
export async function listInstalledApps(): Promise<InstalledApp[]> {
  const venvPython = getVenvPythonPath()
  const helperScript = path.join(RUNTIME_DIR, process.platform === 'win32' ? 'win_helper.py' : 'mac_helper.py')

  try {
    await fs.access(venvPython)
    await fs.access(helperScript)
  } catch {
    return []
  }

  // 传入 list_installed_apps 命令
  const result = await runCommand(venvPython, [helperScript, 'list_installed_apps'])
  if (!result.ok) return []

  try {
    const parsed = JSON.parse(result.stdout)
    // do_list_installed_apps 返回数组（不是 {success, ...} 格式）
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** 加载授权配置 */
export async function loadConfig(): Promise<ComputerUseConfig> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    return {
      authorizedApps: parsed.authorizedApps ?? [],
      grantFlags: {
        ...DEFAULT_CONFIG.grantFlags,
        ...parsed.grantFlags,
      },
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

/** 保存授权配置 */
export async function saveConfig(config: ComputerUseConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true })
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
}

/** 打开系统设置 */
export async function openSystemSettings(pane: string): Promise<void> {
  const allowed = ['Privacy_ScreenCapture', 'Privacy_Accessibility']
  if (!allowed.includes(pane)) {
    throw new Error('Invalid pane')
  }

  if (process.platform === 'darwin') {
    const url = `x-apple.systempreferences:com.apple.preference.security?${pane}`
    await runCommand('open', [url])
  } else if (process.platform === 'win32') {
    await runCommand('cmd', ['/c', 'start', 'ms-settings:privacy'])
  } else {
    throw new Error('Unsupported platform')
  }
}
