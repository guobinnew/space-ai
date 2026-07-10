/**
 * Parse file/dir/code reference markers from message content.
 * Returns an object with extracted refs and the clean content without ref blocks.
 */

import type { ReactNode } from 'react'

type ParsedFileRef = { type: 'file'; filePath: string; content?: string }
type ParsedDirRef = { type: 'dir'; dirPath: string }
type ParsedCodeRef = { type: 'code'; filePath: string; startLine: number; endLine: number }

export type ParsedRef = ParsedFileRef | ParsedDirRef | ParsedCodeRef

/** Regex to match code-block style: File: path\n```\n...\n``` */
const CODE_BLOCK_REF = /^File:\s+(.+?)\n```[\s\S]*?\n```\s*$/gm

/** Regex to match inline fallback: [File: path]  or  [Directory: path] */
const INLINE_FILE_REF = /\[File:\s+(.+?)\]\(file:\/\/.+?\)/g
const INLINE_DIR_REF = /\[Directory:\s+(.+?)\]\(file:\/\/.+?\)/g

/** Regex to match code ref with line range: [File: path (lines 20-30)] */
const INLINE_CODE_REF = /\[File:\s+(.+?)\s+\(lines\s+(\d+)-(\d+)\)\]/g

/**
 * Parse refs from content and return clean content (without ref markers).
 */
export function parseRefsFromContent(content: string): { refs: ParsedRef[]; cleanContent: string } {
  const refs: ParsedRef[] = []
  let clean = content

  // Extract code-block file refs (File: path\n```\n...\n```)
  clean = clean.replace(CODE_BLOCK_REF, (_, filePath: string) => {
    refs.push({ type: 'file', filePath: filePath.trim() })
    return ''
  })

  // Extract inline code refs with line ranges
  clean = clean.replace(INLINE_CODE_REF, (_, filePath: string, start: string, end: string) => {
    refs.push({ type: 'code', filePath: filePath.trim(), startLine: parseInt(start), endLine: parseInt(end) })
    return ''
  })

  // Extract inline file refs: [File: path](file://...)
  clean = clean.replace(INLINE_FILE_REF, (_, filePath: string) => {
    refs.push({ type: 'file', filePath: filePath.trim() })
    return ''
  })

  // Extract inline dir refs: [Directory: path](file://...)
  clean = clean.replace(INLINE_DIR_REF, (_, dirPath: string) => {
    refs.push({ type: 'dir', dirPath: dirPath.trim() })
    return ''
  })

  // Clean up extra blank lines
  clean = clean.replace(/\n{3,}/g, '\n\n').trim()

  return { refs, cleanContent: clean }
}

function shortName(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() || filePath
}

/** Render a list of parsed refs as visual tags */
export function RefTagList({ refs }: { refs: ParsedRef[] }): ReactNode {
  if (refs.length === 0) return null

  return (
    <div className="space-y-1.5 mb-3">
      {refs.map((ref, idx) => {
        const key = `${ref.type}-${idx}`
        switch (ref.type) {
          case 'code':
            return (
              <div key={key} className="flex items-center gap-2 rounded-lg bg-[var(--color-surface-container)] px-3 py-2 text-xs border border-[var(--color-border)]/50">
                <span className="text-[14px] text-[var(--color-brand)] font-mono font-bold shrink-0">{'{}'}</span>
                <span className="font-medium text-[var(--color-text-primary)] truncate max-w-[180px]">{shortName(ref.filePath)}</span>
                <span className="text-[var(--color-brand)] font-mono shrink-0">L{ref.startLine}-L{ref.endLine}</span>
                <span className="text-[var(--color-text-tertiary)] truncate text-[10px] flex-1 min-w-0">{ref.filePath}</span>
              </div>
            )
          case 'file':
            return (
              <div key={key} className="flex items-center gap-2 rounded-lg bg-[var(--color-surface-container)] px-3 py-2 text-xs border border-[var(--color-border)]/50">
                <span className="text-[14px] shrink-0">{'\uD83D\uDCC4'}</span>
                <span className="font-medium text-[var(--color-text-primary)] truncate">{shortName(ref.filePath)}</span>
                <span className="text-[var(--color-text-tertiary)] truncate text-[10px] flex-1 min-w-0">{ref.filePath}</span>
              </div>
            )
          case 'dir':
            return (
              <div key={key} className="flex items-center gap-2 rounded-lg bg-[var(--color-surface-container)] px-3 py-2 text-xs border border-[var(--color-border)]/50">
                <span className="text-[14px] shrink-0">{'\uD83D\uDCC1'}</span>
                <span className="font-medium text-[var(--color-text-primary)] truncate">{shortName(ref.dirPath)}</span>
                <span className="text-[var(--color-text-tertiary)] truncate text-[10px] flex-1 min-w-0">{ref.dirPath}</span>
              </div>
            )
        }
      })}
    </div>
  )
}
