import { useEffect, useState, useCallback } from 'react'
import { Tooltip } from '../shared/Tooltip'
import { useEditorStore } from '../../stores/editorStore'
import { filesystemApi } from '../../api/filesystem'
import { useTranslation } from '../../i18n'

type FileRef = {
  fileName: string
  filePath: string
  isDirectory?: boolean
}

type Props = {
  fileRefs: FileRef[]
}

function shortName(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() || filePath
}

/** 内联警告 SVG */
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

export function FileRefBlock({ fileRefs }: Props) {
  const t = useTranslation()
  // 每个 ref 的存在性：path -> boolean | null(checking)
  const [existMap, setExistMap] = useState<Record<string, boolean | null>>({})

  useEffect(() => {
    let cancelled = false
    const uniquePaths = Array.from(new Set(fileRefs.map((r) => r.filePath)))
    Promise.all(
      uniquePaths.map(async (p) => {
        try {
          const res = await filesystemApi.exists(p)
          return [p, res?.exists ?? false] as const
        } catch {
          return [p, false] as const
        }
      }),
    ).then((entries) => {
      if (cancelled) return
      const next: Record<string, boolean | null> = {}
      for (const [p, v] of entries) next[p] = v
      setExistMap(next)
    })
    return () => {
      cancelled = true
    }
  }, [fileRefs])

  const handleClick = useCallback(
    async (ref: FileRef) => {
      if (existMap[ref.filePath] === false) return
      const { openFile, revealFileInExplorer } = useEditorStore.getState()
      await openFile(ref.filePath)
      const opened = useEditorStore.getState().openFiles
      if (opened.find((f) => f.path === ref.filePath)) {
        revealFileInExplorer(ref.filePath)
      }
    },
    [existMap],
  )

  if (fileRefs.length === 0) return null

  return (
    <div className="space-y-1.5">
      {fileRefs.map((ref, idx) => {
        const isMissing = existMap[ref.filePath] === false
        const tooltip = isMissing
          ? t('ref.notFoundTooltip', { path: ref.filePath })
          : ref.filePath
        return (
          <div
            key={`${ref.filePath}-${idx}`}
            onClick={() => void handleClick(ref)}
            className={`flex items-center gap-2 rounded-lg bg-[var(--color-surface-container)] px-3 py-2 text-xs border overflow-hidden transition-colors ${
              isMissing
                ? 'cursor-not-allowed opacity-70 border-[var(--color-error)]/40'
                : 'border-[var(--color-border)]/50 cursor-pointer hover:bg-[var(--color-surface-hover)]'
            }`}
          >
            <span className="text-[14px] text-[var(--color-brand)] shrink-0">
              {ref.isDirectory ? '📁' : '📄'}
            </span>
            <Tooltip content={tooltip} className="flex-1 min-w-0">
              <span className={`font-medium truncate ${isMissing ? 'text-[var(--color-error)]' : 'text-[var(--color-text-primary)]'}`}>
                {shortName(ref.filePath)}
              </span>
            </Tooltip>
            {isMissing && (
              <NotFoundIcon className="w-3.5 h-3.5 text-[var(--color-error)] shrink-0" />
            )}
          </div>
        )
      })}
    </div>
  )
}
