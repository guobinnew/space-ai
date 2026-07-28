/**
 * Skills types
 */

export type SkillMeta = {
  name: string
  description: string
  source: 'builtin' | 'user' | 'project'
  userInvocable: boolean
  tokenEstimate?: number
}

export type SkillDetail = SkillMeta & {
  content: string
  filePath?: string
}

/** 技能文件树节点 */
export type SkillFileNode = {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  language?: string
  children?: SkillFileNode[]
}

/** 技能文件条目（扁平化） */
export type SkillFileEntry = {
  path: string
  name: string
  size: number
  language: string
}

/** 技能完整详情（含文件树） */
export type SkillFullDetail = {
  meta: SkillMeta & { basePath: string }
  tree: SkillFileNode[]
  files: SkillFileEntry[]
  skillRoot: string
}
