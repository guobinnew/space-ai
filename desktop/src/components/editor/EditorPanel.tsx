import { useState, useRef, useCallback, useEffect } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { FileExplorer } from './FileExplorer'
import { CodeEditor } from './CodeEditor'
import { EditorErrorBoundary } from './EditorErrorBoundary'
import { useTranslation } from '../../i18n'
import { Tooltip } from '../shared/Tooltip'

const MIN_EXPLORER_WIDTH = 200
const MAX_EXPLORER_WIDTH = 400
const DEFAULT_EXPLORER_WIDTH = 200

export function EditorPanel({ rootDir }: { rootDir?: string } = {}) {
  const openFiles = useEditorStore((s) => s.openFiles)
  const activeFilePath = useEditorStore((s) => s.activeFilePath)
  const setActiveFile = useEditorStore((s) => s.setActiveFile)
  const closeFile = useEditorStore((s) => s.closeFile)
  const saveFile = useEditorStore((s) => s.saveFile)
  const isLoading = useEditorStore((s) => s.isLoading)
  const t = useTranslation()

  const closeAllFiles = useEditorStore((s) => s.closeAllFiles)
  const pinFile = useEditorStore((s) => s.pinFile)
  const activeFile = openFiles.find((f) => f.path === activeFilePath)

  const tabBarRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateTabScrollState = useCallback(() => {
    const el = tabBarRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  const scrollTabs = (direction: 'left' | 'right') => {
    const el = tabBarRef.current
    if (!el) return
    const amount = el.clientWidth * 0.6
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' })
  }

  useEffect(() => {
    const el = tabBarRef.current
    if (!el) return
    updateTabScrollState()
    const onScroll = () => updateTabScrollState()
    const ro = new ResizeObserver(() => updateTabScrollState())
    el.addEventListener('scroll', onScroll)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect() }
  }, [updateTabScrollState, openFiles.length])

  type ContextMenu = { x: number; y: number; filePath: string }
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!contextMenu) return
    const handle = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [contextMenu])

  const handleTabContextMenu = (e: React.MouseEvent, filePath: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, filePath })
  }

  const contextCloseFile = () => {
    if (contextMenu) closeFile(contextMenu.filePath)
    setContextMenu(null)
  }
  const contextCloseOthers = () => {
    if (contextMenu) {
      const toClose = openFiles.filter((f) => f.path !== contextMenu.filePath)
      toClose.forEach((f) => closeFile(f.path))
    }
    setContextMenu(null)
  }
  const contextCloseRight = () => {
    if (contextMenu) {
      const idx = openFiles.findIndex((f) => f.path === contextMenu.filePath)
      const toClose = openFiles.slice(idx + 1)
      toClose.forEach((f) => closeFile(f.path))
    }
    setContextMenu(null)
  }
  const contextCloseAll = () => {
    closeAllFiles()
    setContextMenu(null)
  }

  const [explorerWidth, setExplorerWidth] = useState(DEFAULT_EXPLORER_WIDTH)
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)
  const explorerWidthRef = useRef(explorerWidth)
  explorerWidthRef.current = explorerWidth

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    setDragging(true)
    startX.current = e.clientX
    startWidth.current = explorerWidthRef.current

    const handleDragMove = (ev: MouseEvent) => {
      if (!isDragging.current) return
      const delta = startX.current - ev.clientX
      const newWidth = Math.min(MAX_EXPLORER_WIDTH, Math.max(MIN_EXPLORER_WIDTH, startWidth.current + delta))
      setExplorerWidth(newWidth)
    }

    const handleDragEnd = () => {
      isDragging.current = false
      setDragging(false)
      document.removeEventListener('mousemove', handleDragMove)
      document.removeEventListener('mouseup', handleDragEnd)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleDragMove)
    document.addEventListener('mouseup', handleDragEnd)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  return (
    <div ref={containerRef} className="flex h-full relative overflow-hidden bg-[var(--color-surface-container-low)]">
      {dragging && (
        <div className="absolute inset-0 z-50 cursor-col-resize" />
      )}
      {/* Editor area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Tab bar */}
        {openFiles.length > 0 && (
          <div className="shrink-0 flex items-stretch bg-[var(--color-surface-container-low)] border-b border-[var(--color-border)]">
            {canScrollLeft && (
              <button
                onClick={() => scrollTabs('left')}
                className="shrink-0 w-6 flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
              </button>
            )}
            <div
              ref={tabBarRef}
              className="flex-1 min-w-0 flex items-center overflow-x-auto hide-scrollbar"
            >
              {openFiles.map((file) => {
                return (
                  <Tooltip key={file.path} content={file.path}>
                  <div
                    className={`group flex items-center gap-1 px-3 py-1.5 text-[12px] cursor-pointer border-r border-[var(--color-border)] shrink-0 transition-colors
                      ${file.path === activeFilePath
                        ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)]'
                        : 'bg-[var(--color-surface-container)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-secondary)]'
                      }
                      ${contextMenu?.filePath === file.path ? 'bg-[var(--color-surface-hover)]' : ''}`}
                    onClick={() => { setActiveFile(file.path); setContextMenu(null) }}
                    onDoubleClick={() => { if (file.isPreview) pinFile(file.path) }}
                    onContextMenu={(e) => handleTabContextMenu(e, file.path)}
                  >
                    {file.isDirty && (
                      <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" />
                    )}
                    <span className={`truncate max-w-[100px] ${file.isPreview ? 'italic' : ''}`}>{file.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        closeFile(file.path)
                      }}
                      className="shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--color-surface-hover)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>close</span>
                    </button>
                  </div>
                  </Tooltip>
                )
              })}
            </div>
            {canScrollRight && (
              <button
                onClick={() => scrollTabs('right')}
                className="shrink-0 w-6 flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
            )}
          </div>
        )}

        {/* Tab context menu */}
        {contextMenu && (
          <div ref={contextMenuRef} className="fixed z-[100] min-w-[120px] py-1 rounded-lg bg-[var(--color-surface-container-lowest)] border border-[var(--color-border)] shadow-[var(--shadow-dropdown)]" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <button onClick={contextCloseFile} className="w-full px-3 py-1.5 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] text-left">
              {t('editor.close')}
            </button>
            <button onClick={contextCloseOthers} className="w-full px-3 py-1.5 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] text-left">
              {t('editor.closeOthers')}
            </button>
            <button onClick={contextCloseRight} className="w-full px-3 py-1.5 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] text-left">
              {t('editor.closeRight')}
            </button>
            <div className="border-t border-[var(--color-border)] my-1" />
            <button onClick={contextCloseAll} className="w-full px-3 py-1.5 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] text-left">
              {t('editor.closeAll')}
            </button>
          </div>
        )}

        {/* Breadcrumb + Save button */}
        {activeFile && (
          <div className="shrink-0 flex items-center justify-between px-3 py-1 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
            <div className="flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)] min-w-0 overflow-hidden">
              <span className="truncate">{activeFile.path}</span>
              {activeFile.isDirty && (
                <span className="text-[var(--color-warning)] shrink-0">*</span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {isLoading && (
                <span className="text-[10px] text-[var(--color-warning)]">{t('editor.loading')}</span>
              )}
              {activeFile.isDirty && (
                <button
                  onClick={() => void saveFile(activeFile.path)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-[var(--color-brand)] text-[var(--color-btn-primary-fg)] hover:opacity-90 transition-colors"
                >
                  <span className="material-symbols-outlined text-[12px]">save</span>
                  {t('common.save')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Monaco Editor */}
        <div className="flex-1 overflow-hidden">
          <EditorErrorBoundary>
            <CodeEditor />
          </EditorErrorBoundary>
        </div>
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        className="shrink-0 w-[3px] cursor-col-resize bg-transparent hover:bg-[var(--color-brand)]/30 active:bg-[var(--color-brand)]/50 transition-colors z-10"
      />

      {/* File Explorer sidebar - right side */}
      <div
        className="shrink-0 border-l border-[var(--color-border)] bg-[var(--color-surface-sidebar)] overflow-hidden flex flex-col"
        style={{ width: explorerWidth }}
      >
        <FileExplorer width={explorerWidth} root={rootDir} />
      </div>
    </div>
  )
}
