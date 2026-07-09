import { useCallback, useRef, useState, useEffect } from 'react'

type Props = {
  src: string
  alt: string
}

const MIN_ZOOM = 0.1
const MAX_ZOOM = 10
const ZOOM_WHEEL_FACTOR = 0.001

type DragState = {
  pointerId: number
  startX: number
  startY: number
  scrollLeft: number
  scrollTop: number
}

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

export function ImagePreview({ src, alt }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [imageError, setImageError] = useState(false)
  const fitZoomRef = useRef(1)
  const userZoomRef = useRef(false)

  const computeFitZoom = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport || !naturalSize.width || !naturalSize.height) return 1
    const padding = 32
    const availW = viewport.clientWidth - padding
    const availH = viewport.clientHeight - padding
    if (availW <= 0 || availH <= 0) return 1
    return Math.min(availW / naturalSize.width, availH / naturalSize.height)
  }, [naturalSize])

  const handleImageLoad = useCallback(() => {
    const img = imgRef.current
    if (img) {
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight })
    }
    setImageError(false)
  }, [])

  const handleImageError = useCallback(() => {
    setImageError(true)
  }, [])

  useEffect(() => {
    if (naturalSize.width && naturalSize.height) {
      const fit = computeFitZoom()
      fitZoomRef.current = fit
      userZoomRef.current = false
      setZoom(fit)
    }
  }, [naturalSize, computeFitZoom])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const observer = new ResizeObserver(() => {
      const newFit = computeFitZoom()
      fitZoomRef.current = newFit
      if (userZoomRef.current) return
      setZoom((prev) => {
        if (Math.abs(prev - fitZoomRef.current) < 0.01 || prev < newFit) return newFit
        return prev
      })
    })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [computeFitZoom])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      userZoomRef.current = true

      setZoom((prevZoom) => {
        const direction = event.deltaY < 0 ? 1 : -1
        const factor = 1 + direction * ZOOM_WHEEL_FACTOR * Math.abs(event.deltaY)
        const newZoom = clampZoom(prevZoom * factor)
        if (newZoom === prevZoom) return prevZoom

        const rect = viewport.getBoundingClientRect()
        const mouseX = event.clientX - rect.left
        const mouseY = event.clientY - rect.top

        const imgX = (mouseX + viewport.scrollLeft) / prevZoom
        const imgY = (mouseY + viewport.scrollTop) / prevZoom

        requestAnimationFrame(() => {
          viewport.scrollLeft = imgX * newZoom - mouseX
          viewport.scrollTop = imgY * newZoom - mouseY
        })

        return newZoom
      })
    }

    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [])

  const handleDoubleClick = useCallback(() => {
    userZoomRef.current = true
    setZoom((prev) => {
      const fit = computeFitZoom()
      return Math.abs(prev - 1) < 0.01 ? fit : 1
    })
  }, [computeFitZoom])

  const stopDragging = useCallback(() => {
    const viewport = viewportRef.current
    const dragState = dragStateRef.current
    if (viewport && dragState) {
      try {
        viewport.releasePointerCapture(dragState.pointerId)
      } catch {
        // ignore
      }
    }
    dragStateRef.current = null
    setIsDragging(false)
  }, [])

  useEffect(() => stopDragging, [stopDragging])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const viewport = viewportRef.current
    if (!viewport) return

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    }
    setIsDragging(true)
    viewport.setPointerCapture(event.pointerId)
  }, [])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current
    const dragState = dragStateRef.current
    if (!viewport || !dragState || dragState.pointerId !== event.pointerId) return

    event.preventDefault()
    viewport.scrollLeft = dragState.scrollLeft - (event.clientX - dragState.startX)
    viewport.scrollTop = dragState.scrollTop - (event.clientY - dragState.startY)
  }, [])

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerId !== event.pointerId) return
      stopDragging()
    },
    [stopDragging],
  )

  const canvasWidth = naturalSize.width ? naturalSize.width * zoom : undefined
  const canvasHeight = naturalSize.height ? naturalSize.height * zoom : undefined

  if (imageError) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[var(--color-surface)] text-[var(--color-text-tertiary)] gap-2">
        <span className="material-symbols-outlined text-[48px]">broken_image</span>
        <p className="text-sm">Failed to load image</p>
      </div>
    )
  }

  return (
    <div
      ref={viewportRef}
      className="h-full overflow-auto"
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
        background: 'var(--color-surface)',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onDoubleClick={handleDoubleClick}
    >
      <div className="inline-block" style={{ minWidth: '100%', minHeight: '100%', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100%' }}>
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            onLoad={handleImageLoad}
            onError={handleImageError}
            draggable={false}
            className="shrink-0 select-none rounded-lg border border-[var(--color-border)]"
            style={{
              width: canvasWidth ?? 'auto',
              height: canvasHeight ?? 'auto',
              maxWidth: canvasWidth ? undefined : '100%',
              maxHeight: canvasHeight ? undefined : '100%',
              background: 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 50% / 20px 20px',
            }}
          />
        </div>
      </div>
    </div>
  )
}
