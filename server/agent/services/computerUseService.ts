/**
 * ComputerUseService — Python 环境检测 + venv 设置
 *
 * 检测系统 Python，创建 venv，安装依赖（pyautogui, mss, Pillow 等）。
 * 参照 smart-code src/server/api/computer-use-python.ts + computer-use.ts
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import crypto from 'node:crypto'

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
  available: boolean
  platform: string
  pythonAvailable: boolean
  pythonVersion: string | null
  setupCompleted: boolean
  venvPath: string | null
}

export type SetupResult = {
  success: boolean
  message: string
  details?: string
}

/** 运行命令 */
async function runCommand(cmd: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { timeout: 30000, encoding: 'utf-8' })
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
  const available = platform === 'win32' || platform === 'darwin'
  const venvPython = getVenvPython()
  const python = await detectPython(venvPython)
  const setupCompleted = await checkVenvReady()

  return {
    available,
    platform,
    pythonAvailable: python.installed,
    pythonVersion: python.version,
    setupCompleted,
    venvPath: setupCompleted ? VENV_DIR : null,
  }
}

/** 安装设置：创建 venv + 安装依赖 */
export async function runSetup(): Promise<SetupResult> {
  const platform = process.platform
  if (platform !== 'win32' && platform !== 'darwin') {
    return { success: false, message: `不支持的平台: ${platform}` }
  }

  // 1. 检测系统 Python
  const python = await detectPython()
  if (!python.installed || !python.command) {
    return { success: false, message: '未检测到 Python，请先安装 Python 3.8+ 并添加到 PATH' }
  }

  const pythonCmd = python.command
  const pythonArgs = python.prefixArgs

  // 2. 创建 venv
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true })
    // 如果 venv 已存在，先删除
    try { await fs.rm(VENV_DIR, { recursive: true, force: true }) } catch {}
    const venvResult = await runCommand(pythonCmd, [...pythonArgs, '-m', 'venv', VENV_DIR])
    if (!venvResult.ok) {
      return { success: false, message: '创建虚拟环境失败', details: venvResult.stderr }
    }
  } catch (err) {
    return { success: false, message: `创建 venv 失败: ${err instanceof Error ? err.message : String(err)}` }
  }

  // 3. 安装依赖
  const venvPython = getVenvPython()
  const requirements = platform === 'win32' ? WIN_REQUIREMENTS : MAC_REQUIREMENTS

  // 写入 requirements.txt
  const reqFile = path.join(RUNTIME_DIR, 'requirements.txt')
  await fs.mkdir(RUNTIME_DIR, { recursive: true })
  await fs.writeFile(reqFile, requirements.join('\n') + '\n', 'utf-8')

  // 使用清华镜像加速（中国网络环境）
  const pipInstallResult = await runCommand(venvPython, [
    '-m', 'pip', 'install',
    '-i', 'https://pypi.tuna.tsinghua.edu.cn/simple',
    '--trusted-host', 'pypi.tuna.tsinghua.edu.cn',
    ...requirements,
  ])

  if (!pipInstallResult.ok) {
    return { success: false, message: '安装 Python 依赖失败', details: pipInstallResult.stderr.slice(0, 1000) }
  }

  // 4. 部署 helper 脚本
  await deployHelperScript()

  // 5. 验证
  const verifyResult = await runCommand(venvPython, ['-c', 'import pyautogui, mss, PIL; print("ok")'])
  if (!verifyResult.ok || verifyResult.stdout.trim() !== 'ok') {
    return { success: false, message: '依赖验证失败', details: verifyResult.stderr }
  }

  return { success: true, message: '计算机操作环境设置完成' }
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
