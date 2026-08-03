/**
 * Parse file/dir/code reference markers from message content.
 * Returns an object with extracted refs and the clean content without ref blocks.
 */

import { type ReactNode, useEffect, useState, useCallback } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { filesystemApi } from '../../api/filesystem'
import { useTranslation } from '../../i18n'

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

/** 取 ref 的路径（file/code 用 filePath，dir 用 dirPath） */
function refPath(ref: ParsedRef): string {
  return ref.type === 'dir' ? ref.dirPath : ref.filePath
}

/** 内联警告 SVG（三角加感叹号），与 brand 同色调 */
function NotFoundIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M8 1.5l6.5 11.5H1.5L8 1.5z"
        fill="currentColor"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M8 6v3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11.5" r="0.85" fill="currentColor" />
    </svg>
  )
}

/** 单个引用 tag —— 异步检查存在性，不存在则禁用点击并显示警告图标。
 * 注意：不能用 `ref` 作为 prop 名（React 会消费它作为 ref 转发），用 `refItem`。 */
function RefTag({ refItem }: { refItem: ParsedRef }) {
  const t = useTranslation()
  const openFile = useEditorStore((s) => s.openFile)
  const [exists, setExists] = useState<boolean | null>(null) // null=checking, true, false

  const path = refPath(refItem)

  useEffect(() => {
    let cancelled = false
    filesystemApi
      .exists(path)
      .then((res) => {
        if (!cancelled && res) setExists(res.exists)
      })
      .catch(() => {
        if (!cancelled) setExists(false)
      })
    return () => {
      cancelled = true
    }
  }, [path])

  const handleClick = useCallback(() => {
    if (exists === false) return
    if (refItem.type === 'file' || refItem.type === 'code') {
      void openFile(refItem.filePath)
    }
  }, [exists, refItem, openFile])

  const isMissing = exists === false
  // dir 本身就不可点击；file/code 在 missing 时禁用
  const clickable = !isMissing && (refItem.type === 'file' || refItem.type === 'code')

  const baseCls =
    'flex items-center gap-1.5 rounded-lg bg-[var(--color-surface-container)] px-2.5 py-1.5 text-xs border border-[var(--color-border)]/50'
  const stateCls = isMissing
    ? 'cursor-not-allowed opacity-70 border-[var(--color-error)]/40'
    : clickable
      ? 'cursor-pointer hover:border-[var(--color-brand)]/50'
      : ''

  const tooltip = isMissing
    ? t('ref.notFoundTooltip', { path })
    : path

  switch (refItem.type) {
    case 'code':
      return (
        <div key={`code-${path}`} onClick={handleClick} title={tooltip} className={`${baseCls} ${stateCls}`}>
          <span className="text-[14px] text-[var(--color-brand)] font-mono font-bold shrink-0">{'{}'}</span>
          <span className="font-medium text-[var(--color-text-primary)]">{shortName(refItem.filePath)}</span>
          <span className="text-[var(--color-brand)] font-mono shrink-0">L{refItem.startLine}-L{refItem.endLine}</span>
          {isMissing && (
            <NotFoundIcon className="w-3.5 h-3.5 text-[var(--color-error)] shrink-0" />
          )}
        </div>
      )
    case 'file':
      return (
        <div key={`file-${path}`} onClick={handleClick} title={tooltip} className={`${baseCls} ${stateCls}`}>
          <span className="text-[14px] shrink-0">{'\uD83D\uDCC4'}</span>
          <span className="font-medium text-[var(--color-text-primary)]">{shortName(refItem.filePath)}</span>
          {isMissing && (
            <NotFoundIcon className="w-3.5 h-3.5 text-[var(--color-error)] shrink-0" />
          )}
        </div>
      )
    case 'dir':
      return (
        <div key={`dir-${path}`} title={tooltip} className={`${baseCls} ${stateCls}`}>
          <span className="text-[14px] shrink-0">{'\uD83D\uDCC1'}</span>
          <span className="font-medium text-[var(--color-text-primary)]">{shortName(refItem.dirPath)}</span>
          {isMissing && (
            <NotFoundIcon className="w-3.5 h-3.5 text-[var(--color-error)] shrink-0" />
          )}
        </div>
      )
  }
}

/** Render a list of parsed refs as visual tags */
export function RefTagList({ refs }: { refs: ParsedRef[] }): ReactNode {
  if (refs.length === 0) return null

  return (
    <div className="space-y-1.5 mb-3">
      {refs.map((refItem, idx) => (
        <RefTag key={`${refItem.type}-${refPath(refItem)}-${idx}`} refItem={refItem} />
      ))}
    </div>
  )
}
