import { Tooltip } from '../shared/Tooltip'
import { useEditorStore } from '../../stores/editorStore'

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

export function FileRefBlock({ fileRefs }: Props) {
  if (fileRefs.length === 0) return null

  const handleClick = async (ref: FileRef) => {
    const { openFile, revealFileInExplorer } = useEditorStore.getState()
    await openFile(ref.filePath)
    const opened = useEditorStore.getState().openFiles
    if (opened.find((f) => f.path === ref.filePath)) {
      revealFileInExplorer(ref.filePath)
    }
  }

  return (
    <div className="space-y-1.5">
      {fileRefs.map((ref, idx) => (
        <div
          key={`${ref.filePath}-${idx}`}
          onClick={() => void handleClick(ref)}
          className="flex items-center gap-2 rounded-lg bg-[var(--color-surface-container)] px-3 py-2 text-xs border border-[var(--color-border)]/50 overflow-hidden cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          <span className="text-[14px] text-[var(--color-brand)] shrink-0">
            {ref.isDirectory ? '📁' : '📄'}
          </span>
          <Tooltip content={ref.filePath} className="flex-1 min-w-0">
            <span className="font-medium text-[var(--color-text-primary)] truncate">
              {shortName(ref.filePath)}
            </span>
          </Tooltip>
        </div>
      ))}
    </div>
  )
}
