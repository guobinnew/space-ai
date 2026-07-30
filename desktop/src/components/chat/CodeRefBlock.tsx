import { Tooltip } from '../shared/Tooltip'

type CodeRef = {
  fileName: string
  filePath: string
  startLine: number
  endLine: number
}

type Props = {
  codeRefs: CodeRef[]
}

function formatLineRange(startLine: number, endLine: number): string {
  return startLine === endLine ? `L${startLine}` : `L${startLine}-L${endLine}`
}

function shortName(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() || filePath
}

export function CodeRefBlock({ codeRefs }: Props) {
  if (codeRefs.length === 0) return null

  return (
    <div className="space-y-1.5">
      {codeRefs.map((ref, idx) => (
        <div
          key={`${ref.filePath}-${ref.startLine}-${ref.endLine}-${idx}`}
          className="flex items-center gap-2 rounded-lg bg-[var(--color-surface-container)] px-3 py-2 text-xs border border-[var(--color-border)]/50 overflow-hidden"
        >
          <span className="text-[14px] text-[var(--color-brand)] font-mono font-bold shrink-0">{'{}'}</span>
          <Tooltip content={ref.filePath}>
            <span className="font-medium text-[var(--color-text-primary)] truncate max-w-[180px]">
              {shortName(ref.filePath)}
            </span>
          </Tooltip>
          <span className="text-[var(--color-brand)] font-mono shrink-0">
            {formatLineRange(ref.startLine, ref.endLine)}
          </span>
          <Tooltip content={ref.filePath}>
            <span className="text-[var(--color-text-tertiary)] truncate text-[10px] flex-1 min-w-0">
              {ref.filePath}
            </span>
          </Tooltip>
        </div>
      ))}
    </div>
  )
}
