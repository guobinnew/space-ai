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

export interface SkillMeta {
  name: string
  description: string
  source: 'builtin' | 'user' | 'project'
  userInvocable: boolean
  tokenEstimate?: number
  basePath?: string
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

  async getSkill(name: string): Promise<SkillDetail> {
    const dirPath = path.join(this.getSkillsDir(), name)
    const detail = await this.loadSkill(dirPath, name)
    if (!detail) throw ApiError.notFound(`Skill not found: ${name}`)
    return detail
  }
}

export const skillService = new SkillService()
