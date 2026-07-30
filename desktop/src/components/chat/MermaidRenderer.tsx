import { useEffect, useRef, useState, useCallback } from 'react'
import DOMPurify from 'dompurify'
import mermaid from 'mermaid'
import { Modal } from '../shared/Modal'
import { CopyButton } from '../shared/CopyButton'

type Props = {
  code: string
}

let mermaidInitialized = false
const MIN_PREVIEW_ZOOM = 0.5
const MAX_PREVIEW_ZOOM = 3
const PREVIEW_ZOOM_STEP = 0.25

type SvgMetrics = { width: number; height: number }
type DragState = {
  pointerId: number; startX: number; startY: number
  scrollLeft: number; scrollTop: number
}

function initMermaid() {
  if (mermaidInitialized) return
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'strict',
    fontFamily: 'var(--font-sans)',
  })
  mermaidInitialized = true
}

let mermaidIdCounter = 0

function clampZoom(value: number) {
  return Math.min(MAX_PREVIEW_ZOOM, Math.max(MIN_PREVIEW_ZOOM, value))
}

function getPointerPosition(event: Pick<React.PointerEvent<HTMLDivElement>, 'clientX' | 'clientY' | 'pageX' | 'pageY'>) {
  const x = Number.isFinite(event.clientX) ? event.clientX : event.pageX
  const y = Number.isFinite(event.clientY) ? event.clientY : event.pageY
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 }
}

function parseSvgMetrics(svg: string): SvgMetrics | null {
  const viewBoxMatch = svg.match(/viewBox="([^"]+)"/i)
  if (viewBoxMatch) {
    const viewBox = viewBoxMatch[1]
    if (!viewBox) return null
    const values = viewBox.split(/[\s,]+/).map((part) => Number.parseFloat(part))
    if (values.length === 4 && values.every((value) => Number.isFinite(value))) {
      const [, , width, height] = values
      if (width !== undefined && height !== undefined) return { width, height }
    }
  }
  const widthMatch = svg.match(/\bwidth="([0-9.]+)(?:px)?"/i)
  const heightMatch = svg.match(/\bheight="([0-9.]+)(?:px)?"/i)
  if (widthMatch && heightMatch) {
    const widthValue = widthMatch[1]
    const heightValue = heightMatch[1]
    if (!widthValue || !heightValue) return null
    const width = Number.parseFloat(widthValue)
    const height = Number.parseFloat(heightValue)
    if (Number.isFinite(width) && Number.isFinite(height)) return { width, height }
  }
  return null
}

export function MermaidRenderer({ code }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previewViewportRef = useRef<HTMLDivElement>(null)
  const previewContentRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewZoom, setPreviewZoom] = useState(1)
  const [isDraggingPreview, setIsDraggingPreview] = useState(false)
  const svgMetrics = svg ? parseSvgMetrics(svg) : null

  useEffect(() => {
    let cancelled = false
    initMermaid()
    const id = `mermaid-${++mermaidIdCounter}`
    mermaid.render(id, code).then(
      ({ svg: renderedSvg }) => {
        if (cancelled) return
        if (/d="[^"]*\bNaN\b/i.test(renderedSvg)) {
          setError('Mermaid produced invalid SVG with NaN coordinates. Check diagram syntax.')
          setSvg(null); return
        }
        setSvg(renderedSvg)
        setError(null)
      },
      (err) => { if (!cancelled) { setError(String(err?.message || err)); setSvg(null) } },
    )
    return () => { cancelled = true }
  }, [code])

  const handlePreview = useCallback(() => setPreviewOpen(true), [])
  const handlePreviewClose = useCallback(() => setPreviewOpen(false), [])

  const handleContainerClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const anchor = target.closest('a[href], a[xlink\\:href]') as SVGElement | HTMLAnchorElement | null
    if (anchor) {
      event.preventDefault(); event.stopPropagation()
      const href = anchor.getAttribute('href') || anchor.getAttribute('xlink:href') || ''
      if (!href) return
      if (/^(https?:|mailto:|tel:)/i.test(href)) { window.open(href, '_blank', 'noopener,noreferrer'); return }
    } else {
      handlePreview()
    }
  }, [handlePreview])

  const zoomIn = useCallback(() => setPreviewZoom((v) => clampZoom(v + PREVIEW_ZOOM_STEP)), [])
  const zoomOut = useCallback(() => setPreviewZoom((v) => clampZoom(v - PREVIEW_ZOOM_STEP)), [])
  const resetZoom = useCallback(() => setPreviewZoom(1), [])

  useEffect(() => { if (!previewOpen) { setPreviewZoom(1); setIsDraggingPreview(false); dragStateRef.current = null } }, [previewOpen, svg])

  const stopDraggingPreview = useCallback(() => {
    const viewport = previewViewportRef.current; const dragState = dragStateRef.current
    if (viewport && dragState) { try { viewport.releasePointerCapture(dragState.pointerId) } catch {} }
    dragStateRef.current = null; setIsDraggingPreview(false)
  }, [])

  useEffect(() => stopDraggingPreview, [stopDraggingPreview])

  useEffect(() => {
    if (!previewOpen || !previewContentRef.current) return
    const renderedSvg = previewContentRef.current.querySelector('svg')
    if (!renderedSvg) return
    renderedSvg.setAttribute('width', '100%'); renderedSvg.setAttribute('height', '100%')
    renderedSvg.style.width = '100%'; renderedSvg.style.height = '100%'; renderedSvg.style.display = 'block'
  }, [previewOpen, svg, previewZoom])

  const handlePreviewWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    setPreviewZoom((v) => clampZoom(v + (event.deltaY < 0 ? PREVIEW_ZOOM_STEP : -PREVIEW_ZOOM_STEP)))
  }, [])

  const handlePreviewPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const viewport = previewViewportRef.current
    if (!viewport) return
    const { x, y } = getPointerPosition(event)
    dragStateRef.current = { pointerId: event.pointerId, startX: x, startY: y, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop }
    setIsDraggingPreview(true)
    viewport.setPointerCapture(event.pointerId)
  }, [])

  const handlePreviewPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = previewViewportRef.current; const dragState = dragStateRef.current
    if (!viewport || !dragState || dragState.pointerId !== event.pointerId) return
    event.preventDefault()
    const { x, y } = getPointerPosition(event)
    viewport.scrollLeft = dragState.scrollLeft - (x - dragState.startX)
    viewport.scrollTop = dragState.scrollTop - (y - dragState.startY)
  }, [])

  const handlePreviewPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return
    stopDraggingPreview()
  }, [stopDraggingPreview])

  const previewCanvasStyle = svgMetrics ? { width: `${svgMetrics.width * previewZoom}px`, height: `${svgMetrics.height * previewZoom}px` } : undefined

  if (error) {
    return (
      <div className="my-4 overflow-hidden rounded-xl border border-[var(--color-error)]/30">
        <div className="flex items-center gap-2 border-b border-[var(--color-error)]/20 bg-[var(--color-error-container)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-error)]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="16" r="1" fill="white" /></svg>
          Mermaid Error
        </div>
        <div className="bg-[var(--color-error-container)]/30 px-3 py-2 font-mono text-[11px] text-[var(--color-error)]">{error}</div>
      </div>
    )
  }

  if (!svg) {
    return (
      <div className="my-4 flex items-center justify-center rounded-xl border border-[var(--color-border)]/50 bg-[var(--color-surface-container-low)] py-8">
        <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          Rendering diagram...
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="my-4 overflow-hidden rounded-xl border border-[var(--color-border)]/50 bg-[var(--color-surface-container-low)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)]/40 bg-[var(--color-surface-container)] px-3 py-1.5 text-[11px] text-[var(--color-text-tertiary)]">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" /></svg>
            <span className="font-semibold uppercase tracking-wider">Mermaid</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={handlePreview} className="flex items-center gap-1 rounded-md border border-[var(--color-border)]/40 bg-[var(--color-surface-container-lowest)] px-2 py-1 text-[11px] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" /></svg>
              Preview
            </button>
            <CopyButton text={code} className="rounded-md p-1 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]" />
          </div>
        </div>
        <div
          ref={containerRef}
          className="flex items-center justify-center overflow-auto bg-white p-4 cursor-pointer"
          style={{ maxHeight: 400 }}
          onClick={handleContainerClick}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } }) }}
        />
      </div>

      <Modal open={previewOpen} onClose={handlePreviewClose} width={1100}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" /></svg>
              Mermaid Diagram
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-1 py-1">
                <button type="button" onClick={zoomOut} aria-label="Zoom out" className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
                <button type="button" onClick={resetZoom} className="min-w-[68px] rounded-md px-2 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]">
                  {Math.round(previewZoom * 100)}%
                </button>
                <button type="button" onClick={zoomIn} aria-label="Zoom in" className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
              </div>
              <CopyButton text={code} className="rounded-md p-1 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]" />
            </div>
          </div>
          <div
            ref={previewViewportRef}
            className="overflow-auto rounded-xl bg-white"
            style={{ maxHeight: '75vh', cursor: isDraggingPreview ? 'grabbing' : 'grab' }}
            onWheel={handlePreviewWheel}
            onPointerDown={handlePreviewPointerDown}
            onPointerMove={handlePreviewPointerMove}
            onPointerUp={handlePreviewPointerUp}
            onPointerCancel={handlePreviewPointerUp}
            onPointerLeave={handlePreviewPointerUp}
          >
            <div className="min-h-full min-w-full p-6">
              <div
                ref={previewContentRef}
                className="mx-auto shrink-0 select-none"
                style={previewCanvasStyle}
                onClick={handleContainerClick}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } }) }}
              />
            </div>
          </div>
          <div className="text-[11px] text-[var(--color-text-tertiary)]">
            Use the zoom controls to enlarge the diagram. Drag inside the preview to pan, or use the trackpad, mouse wheel, and scrollbars. Hold Ctrl/Command while scrolling to zoom.
          </div>
        </div>
      </Modal>
    </>
  )
}
