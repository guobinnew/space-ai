/**
 * QueryQueue — 排队查询列表
 *
 * 当 Agent 忙碌时，用户发送的消息进入排队队列，
 * 当前查询完成后自动依次执行。
 */

import { useState, useRef, useCallback } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useTranslation } from '../../i18n'
import type { QueuedQuery } from '../../types/chat'

const EMPTY_QUERIES: QueuedQuery[] = []

interface QueryQueueProps {
  sessionId: string
}

export function QueryQueue({ sessionId }: QueryQueueProps) {
  const t = useTranslation();
  const { getSession, removeQueuedQuery, reorderQueuedQueries, executeQueryNow } = useChatStore()
  const [expanded, setExpanded] = useState(true)

  const sessionState = getSession(sessionId)
  const queries = sessionState.queuedQueries || EMPTY_QUERIES
  const chatState = sessionState.chatState

  const dragItemRef = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    dragItemRef.current = index
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }, [])

  const handleDragLeave = useCallback(() => setDragOverIndex(null), [])

  const handleDrop = useCallback((e: React.DragEvent, dropIdx: number) => {
    e.preventDefault()
    const draggedIdx = dragItemRef.current
    if (draggedIdx === null || draggedIdx === dropIdx || !sessionId) {
      dragItemRef.current = null
      setDragOverIndex(null)
      return
    }
    const reordered = [...queries]
    const [moved] = reordered.splice(draggedIdx, 1)
    if (moved) {
      reordered.splice(dropIdx, 0, moved)
      reorderQueuedQueries(sessionId, reordered)
    }
    dragItemRef.current = null
    setDragOverIndex(null)
  }, [queries, sessionId, reorderQueuedQueries])

  const handleRemove = useCallback((queryId: string) => {
    if (sessionId) removeQueuedQuery(sessionId, queryId)
  }, [sessionId, removeQueuedQuery])

  const handleClearAll = useCallback(() => {
    if (sessionId) {
      for (let i = queries.length - 1; i >= 0; i--) {
        const q = queries[i]
        if (q) removeQueuedQuery(sessionId, q.id)
      }
    }
  }, [sessionId, queries, removeQueuedQuery])

  const handleExecuteNow = useCallback((queryId: string) => {
    if (sessionId) executeQueryNow(sessionId, queryId)
  }, [sessionId, executeQueryNow])

  if (queries.length === 0) return null

  const isProcessing = chatState !== 'idle'
  const dragIndex = dragItemRef.current

  return (
    <div className="shrink-0 mx-auto max-w-3xl w-full">
      <div className="overflow-hidden rounded-xl border border-[var(--color-border)]/60 bg-[var(--color-surface-container-low)]">
        {/* Header */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded((v) => !v)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v) } }}
          className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--color-surface-hover)]/50"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-brand)]">
            {expanded ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
          </svg>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-outline)]">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
          <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">
            {t('query.queueTitle', { n: queries.length })}
          </span>
          {isProcessing && (
            <span className="flex items-center gap-1.5 text-[10px] text-[var(--color-warning)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)] animate-pulse" />
              {t('query.processing')}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleClearAll() }}
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--color-text-tertiary)] hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            {t('query.clear')}
          </button>
        </div>

        {/* List */}
        {expanded && (
          <div className="border-t border-[var(--color-border)]/60">
            {queries.map((query, index) => {
              const isFirst = index === 0 && isProcessing
              const isDragging = dragIndex === index
              const isDragOver = dragOverIndex === index && dragIndex !== index
              const previewText = query.content.length > 80
                ? query.content.slice(0, 80) + '...'
                : query.content

              return (
                <div
                  key={query.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDragEnd={() => { dragItemRef.current = null; setDragOverIndex(null) }}
                  onDrop={(e) => { e.preventDefault(); handleDrop(e, index) }}
                  className={`group flex items-center gap-2 px-3 py-2 transition-colors ${
                    isDragging ? 'opacity-40' : ''
                  } ${
                    isDragOver && !isDragging ? 'bg-[var(--color-brand)]/5' : 'hover:bg-[var(--color-surface-hover)]/40'
                  }`}
                >
                  {/* Drag handle */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 cursor-grab active:cursor-grabbing ${isDragging ? 'text-[var(--color-brand)]' : 'text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-secondary)]'}`}>
                    <circle cx="9" cy="5" r="1" />
                    <circle cx="15" cy="5" r="1" />
                    <circle cx="9" cy="12" r="1" />
                    <circle cx="15" cy="12" r="1" />
                    <circle cx="9" cy="19" r="1" />
                    <circle cx="15" cy="19" r="1" />
                  </svg>

                  {/* Index badge */}
                  <span className={`shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold ${
                    isFirst
                      ? 'bg-[var(--color-brand)]/15 text-[var(--color-brand)]'
                      : 'bg-[var(--color-surface-container-high)] text-[var(--color-text-tertiary)]'
                  }`}>
                    {index + 1}
                  </span>

                  {/* Text */}
                  <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--color-text-primary)]">
                    {previewText}
                  </span>

                  {/* Execute now */}
                  {isProcessing && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleExecuteNow(query.id) }}
                      className="shrink-0 flex items-center justify-center w-5 h-5 rounded text-[var(--color-text-tertiary)] hover:bg-[var(--color-brand)]/10 hover:text-[var(--color-brand)] transition-colors"
                      title={t('query.runNow')}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </button>
                  )}

                  {/* Remove */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRemove(query.id) }}
                    className="shrink-0 flex items-center justify-center w-5 h-5 rounded text-[var(--color-text-tertiary)] hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)] transition-colors"
                    title={t('query.delete')}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
