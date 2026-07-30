/**
 * Parse file/dir/code reference markers from message content.
 * Returns an object with extracted refs and the clean content without ref blocks.
 */

import type { ReactNode } from 'react'
import { useEditorStore } from '../../stores/editorStore'

type ParsedFileRef = { type: 'file'; filePath: string; content?: string }
type ParsedDirRef = { type: 'dir'; dirPath: string }
type ParsedCodeRef = { type: 'code'; filePath: string; startLine: number; endLine: number }

export type ParsedRef = ParsedFileRef | ParsedDirRef | ParsedCodeRef

/** Regex to match code-block style: File: path\n```\n...\n```  or  File: path (L20-L30)\n```\n...\n``` */
const CODE_BLOCK_REF = /^File:\s+(.+?)(?:\s+\(L(\d+)-L(\d+)\))?\n```[\s\S]*?\n```\s*$/gm

/** Regex to match inline fallback: [File: path (L20-L30)] */
const INLINE_CODE_REF = /\[File:\s+(.+?)\s+\(L(\d+)-L(\d+)\)\]/g

/** Regex to match inline fallback: [File: path]  or  [Directory: path] */
const INLINE_FILE_REF = /\[File:\s+(.+?)\]\(file:\/\/.+?\)/g
const INLINE_DIR_REF = /\[Directory:\s+(.+?)\]\(file:\/\/.+?\)/g

/**
 * Regex to match PLAIN inline fallback: [File: path] / [Directory: path]
 * （无 file:// 后缀，例如 ChatInput 在文件读取失败时发送的回退格式）。
 * 负向先行断言 (?!\() 确保不会误匹配 [File: path](file://...) 的前半段。
 */
const INLINE_FILE_REF_PLAIN = /\[File:\s+(.+?)\](?!\()/g
const INLINE_DIR_REF_PLAIN = /\[Directory:\s+(.+?)\](?!\()/g

/**
 * Parse refs from content and return clean content (without ref markers).
 */
export function parseRefsFromContent(content: string): { refs: ParsedRef[]; cleanContent: string } {
  const refs: ParsedRef[] = []
  let clean = content

  // Extract code-block file refs (File: path\n```\n...\n``` or File: path (L20-L30)\n```\n...\n```)
  clean = clean.replace(CODE_BLOCK_REF, (_, filePath: string, startLine?: string, endLine?: string) => {
    const path = filePath.trim()
    if (startLine && endLine) {
      refs.push({ type: 'code', filePath: path, startLine: parseInt(startLine), endLine: parseInt(endLine) })
    } else {
      refs.push({ type: 'file', filePath: path })
    }
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

  // Extract PLAIN inline file refs: [File: path] (无 file:// 后缀的回退格式)
  clean = clean.replace(INLINE_FILE_REF_PLAIN, (_, filePath: string) => {
    refs.push({ type: 'file', filePath: filePath.trim() })
    return ''
  })

  // Extract PLAIN inline dir refs: [Directory: path]
  clean = clean.replace(INLINE_DIR_REF_PLAIN, (_, dirPath: string) => {
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
  const openFile = useEditorStore((s) => s.openFile)
  if (refs.length === 0) return null

  return (
    <div className="space-y-1.5 mb-3">
      {refs.map((ref, idx) => {
        const key = `${ref.type}-${idx}`
        const open = () => {
          if (ref.type === 'file' || ref.type === 'code') {
            void openFile(ref.filePath)
          }
        }
        const clickable = ref.type === 'file' || ref.type === 'code'
        switch (ref.type) {
          case 'code':
            return (
              <div key={key} onClick={open} title={ref.filePath} className={`flex items-center gap-1.5 rounded-lg bg-[var(--color-surface-container)] px-2.5 py-1.5 text-xs border border-[var(--color-border)]/50 ${clickable ? 'cursor-pointer hover:border-[var(--color-brand)]/50' : ''}`}>
                <span className="text-[14px] text-[var(--color-brand)] font-mono font-bold shrink-0">{'{}'}</span>
                <span className="font-medium text-[var(--color-text-primary)]">{shortName(ref.filePath)}</span>
                <span className="text-[var(--color-brand)] font-mono shrink-0">L{ref.startLine}-L{ref.endLine}</span>
              </div>
            )
          case 'file':
            return (
              <div key={key} onClick={open} title={ref.filePath} className={`flex items-center gap-1.5 rounded-lg bg-[var(--color-surface-container)] px-2.5 py-1.5 text-xs border border-[var(--color-border)]/50 ${clickable ? 'cursor-pointer hover:border-[var(--color-brand)]/50' : ''}`}>
                <span className="text-[14px] shrink-0">{'\uD83D\uDCC4'}</span>
                <span className="font-medium text-[var(--color-text-primary)]">{shortName(ref.filePath)}</span>
              </div>
            )
          case 'dir':
            return (
              <div key={key} title={ref.dirPath} className="flex items-center gap-1.5 rounded-lg bg-[var(--color-surface-container)] px-2.5 py-1.5 text-xs border border-[var(--color-border)]/50">
                <span className="text-[14px] shrink-0">{'\uD83D\uDCC1'}</span>
                <span className="font-medium text-[var(--color-text-primary)]">{shortName(ref.dirPath)}</span>
              </div>
            )
        }
      })}
    </div>
  )
}
