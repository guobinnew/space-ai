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
