/**
 * Skill Service — 扫描 ~/.spaceai/skills/ 读取技能列表
 *
 * 每个子目录视为一个 skill，元数据来自 `SKILL.md` frontmatter：
 *   ---
 *   name: code-review
 *   description: 代码审查技能
 *   userInvocable: true
 *   ---
 *   # 详细内容（markdown）
 *
 * 若无 frontmatter，则 name 取目录名、description 取首行非标题文本。
 * source 统一为 'user'（由用户安装）。
 *
 * Storage: ~/.spaceai/skills/<name>/SKILL.md
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { ApiError } from '../middleware/errorHandler'
import type { SkillFileNode, SkillFileEntry, SkillFullDetail } from '../types/skill'

export interface SkillMeta {
  name: string
  description: string
  source: 'builtin' | 'user' | 'project'
  userInvocable: boolean
  tokenEstimate?: number
  basePath?: string
  /** 磁盘上的实际目录名（可能与 name 不同） */
  dirName?: string
}

export interface SkillDetail extends SkillMeta {
  content: string
  basePath: string
}

const SKILL_FILENAME = 'SKILL.md'

export class SkillService {
  private configDir: string

  constructor() {
    this.configDir = process.env.SPACEAI_CONFIG_DIR || path.join(os.homedir(), '.spaceai')
  }

  private getSkillsDir(): string {
    return path.join(this.configDir, 'skills')
  }

  /** 解析 SKILL.md 的 frontmatter 与正文 */
  private parseSkillMarkdown(raw: string, fallbackName: string): {
    meta: Partial<SkillMeta>
    content: string
  } {
    const meta: Partial<SkillMeta> = {}
    let content = raw

    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
    if (fmMatch) {
      const fmText = fmMatch[1]
      content = fmMatch[2] || ''

      for (const line of fmText.split(/\r?\n/)) {
        const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/)
        if (!m) continue
        const key = m[1].trim()
        let value = m[2].trim()
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        if (key === 'name' && value) meta.name = value
        else if (key === 'description') meta.description = value
        else if (key === 'userInvocable') {
          meta.userInvocable = value === 'true' || value === 'yes' || value === '1'
        }
      }
    } else {
      const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      const firstLine = lines.find((l) => !l.startsWith('#'))
      if (firstLine) meta.description = firstLine
    }

    if (!meta.name) meta.name = fallbackName
    if (meta.description === undefined) meta.description = ''
    if (meta.userInvocable === undefined) meta.userInvocable = true

    return { meta, content }
  }

  private estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4))
  }

  private async loadSkill(dirPath: string, dirName: string): Promise<SkillDetail | null> {
    const skillFile = path.join(dirPath, SKILL_FILENAME)
    let raw: string
    try {
      raw = await fs.readFile(skillFile, 'utf-8')
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw ApiError.internal(`Failed to read skill ${dirName}: ${err}`)
    }

    const { meta, content } = this.parseSkillMarkdown(raw, dirName)
    const name = meta.name || dirName
    return {
      name,
      description: meta.description || '',
      source: 'user',
      userInvocable: meta.userInvocable ?? true,
      content,
      basePath: dirPath,
      tokenEstimate: this.estimateTokens(raw),
      dirName,
    }
  }

  async listSkills(): Promise<SkillMeta[]> {
    const skillsDir = this.getSkillsDir()
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(skillsDir, { withFileTypes: true })
    } catch {
      return []
    }

    const skills: SkillMeta[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const detail = await this.loadSkill(path.join(skillsDir, entry.name), entry.name)
      if (detail) {
        const { content: _content, ...meta } = detail
        skills.push(meta)
      }
    }
    return skills
  }

  /** 根据 name 或 dirName 查找技能目录 */
  private async findSkillDir(nameOrDirName: string): Promise<string | null> {
    const skillsDir = this.getSkillsDir()
    console.log('[skillService] findSkillDir: looking for', nameOrDirName, 'in', skillsDir)

    // 1. 先尝试直接作为目录名
    const directPath = path.join(skillsDir, nameOrDirName)
    try {
      const skillFile = path.join(directPath, SKILL_FILENAME)
      await fs.access(skillFile)
      console.log('[skillService] findSkillDir: found direct match at', directPath)
      return directPath
    } catch {
      // 目录不存在，继续搜索
    }

    // 2. 扫描所有目录，匹配 frontmatter name 或 dirName
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(skillsDir, { withFileTypes: true })
      console.log('[skillService] findSkillDir: found', entries.length, 'entries in skills dir')
    } catch (err) {
      console.log('[skillService] findSkillDir: failed to read skills dir', err)
      return null
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      // 匹配目录名
      if (entry.name === nameOrDirName) {
        console.log('[skillService] findSkillDir: matched dir name', entry.name)
        return path.join(skillsDir, entry.name)
      }
      // 匹配 frontmatter name
      const detail = await this.loadSkill(path.join(skillsDir, entry.name), entry.name)
      if (detail && detail.name === nameOrDirName) {
        console.log('[skillService] findSkillDir: matched frontmatter name', detail.name, '-> dir', entry.name)
        return path.join(skillsDir, entry.name)
      }
    }

    console.log('[skillService] findSkillDir: no match found')
    return null
  }

  async getSkill(name: string): Promise<SkillDetail> {
    const dirPath = await this.findSkillDir(name)
    if (!dirPath) throw ApiError.notFound(`Skill not found: ${name}`)
    const dirName = path.basename(dirPath)
    const detail = await this.loadSkill(dirPath, dirName)
    if (!detail) throw ApiError.notFound(`Skill not found: ${name}`)
    return detail
  }

  // ─── 文件树构建（复刻 smart-code）────────────────────────────

  private static readonly EXT_TO_LANG: Record<string, string> = {
    '.md': 'markdown', '.mdx': 'markdown',
    '.ts': 'typescript', '.tsx': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript',
    '.mjs': 'javascript', '.cjs': 'javascript',
    '.py': 'python', '.rb': 'ruby',
    '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash',
    '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml',
    '.toml': 'toml', '.xml': 'xml', '.html': 'html',
    '.css': 'css', '.scss': 'scss',
    '.sql': 'sql', '.graphql': 'graphql',
    '.dockerfile': 'dockerfile',
    '.txt': 'text', '.csv': 'text', '.log': 'text',
    '.env': 'text', '.gitignore': 'text',
  }

  private static readonly SKIP_DIRS = new Set([
    'node_modules', '.git', '__pycache__', 'dist', '.next', '.cache',
  ])

  private static readonly SKIP_FILES = new Set([
    '.DS_Store', 'Thumbs.db', 'package-lock.json',
  ])

  private async scanDir(dirPath: string, rootPath: string): Promise<SkillFileNode[]> {
    const nodes: SkillFileNode[] = []
    let entries
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true })
    } catch {
      return nodes
    }

    for (const entry of entries) {
      if (SkillService.SKIP_FILES.has(entry.name)) continue
      const fullPath = path.join(dirPath, entry.name)
      const relPath = path.relative(rootPath, fullPath).split(path.sep).join('/')

      if (entry.isDirectory()) {
        if (SkillService.SKIP_DIRS.has(entry.name)) continue
        const children = await this.scanDir(fullPath, rootPath)
        nodes.push({
          name: entry.name,
          path: relPath,
          type: 'directory',
          children: children.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
            return a.name.localeCompare(b.name)
          }),
        })
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        const size = await fs.stat(fullPath).then(s => s.size).catch(() => 0)
        nodes.push({
          name: entry.name,
          path: relPath,
          type: 'file',
          size,
          language: SkillService.EXT_TO_LANG[ext] || 'text',
        })
      }
    }

    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  private flattenTree(nodes: SkillFileNode[]): SkillFileEntry[] {
    const files: SkillFileEntry[] = []
    for (const node of nodes) {
      if (node.type === 'file') {
        files.push({
          path: node.path,
          name: node.name,
          size: node.size ?? 0,
          language: node.language ?? 'text',
        })
      }
      if (node.type === 'directory' && node.children) {
        files.push(...this.flattenTree(node.children))
      }
    }
    return files
  }

  async getSkillDetail(name: string): Promise<SkillFullDetail> {
    console.log('[skillService] getSkillDetail called with name:', name)
    const dirPath = await this.findSkillDir(name)
    console.log('[skillService] findSkillDir result:', dirPath)
    if (!dirPath) throw ApiError.notFound(`Skill not found: ${name}`)
    const dirName = path.basename(dirPath)
    const detail = await this.loadSkill(dirPath, dirName)
    if (!detail) throw ApiError.notFound(`Skill not found: ${name}`)

    const tree = await this.scanDir(dirPath, dirPath)
    console.log('[skillService] scanDir result, nodes:', tree.length)
    const files = this.flattenTree(tree)
    console.log('[skillService] flattenTree result, files:', files.length)

    return {
      meta: {
        name: detail.name,
        description: detail.description,
        source: detail.source,
        userInvocable: detail.userInvocable,
        tokenEstimate: detail.tokenEstimate,
        basePath: detail.basePath,
        dirName: detail.dirName,
      },
      tree,
      files,
      skillRoot: dirPath,
    }
  }

  async getSkillFile(name: string, filePath: string): Promise<{ content: string; language: string }> {
    const dirPath = await this.findSkillDir(name)
    if (!dirPath) throw ApiError.notFound(`Skill not found: ${name}`)

    // 安全检查：确保文件在技能目录内
    const fullPath = path.resolve(dirPath, filePath)
    if (!fullPath.startsWith(path.resolve(dirPath))) {
      throw ApiError.badRequest('Invalid file path')
    }

    const ext = path.extname(fullPath).toLowerCase()
    const language = SkillService.EXT_TO_LANG[ext] || 'text'

    try {
      const content = await fs.readFile(fullPath, 'utf-8')
      return { content, language }
    } catch {
      throw ApiError.notFound(`File not found: ${filePath}`)
    }
  }
}

export const skillService = new SkillService()
