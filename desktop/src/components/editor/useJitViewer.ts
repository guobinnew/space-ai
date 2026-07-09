import { useCallback, useEffect, useRef, useState } from 'react'
import { createViewer, type ViewerInstance } from 'jit-viewer'
import 'jit-viewer/style.css'

export function useJitViewer(type: 'docx' | 'xlsx' | 'pptx', url: string, fileName: string) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<ViewerInstance | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const mountCountRef = useRef(0)

  const mountViewer = useCallback((container: HTMLDivElement, blobData: Blob) => {
    container.innerHTML = ''

    const rect = container.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    const mountId = ++mountCountRef.current
    const viewer = createViewer({
      target: container,
      file: blobData,
      filename: fileName,
      type,
      toolbar: true,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      proxyUrl: '',
    })

    viewerRef.current = viewer
    viewer.on('error', (err: unknown) => {
      console.error('[useJitViewer] viewer error event:', err)
    })
    viewer.on('load', () => {
      console.log('[useJitViewer] viewer load event (content rendered)')
    })
    viewer.mount().then(() => {
      console.log('[useJitViewer] viewer mounted successfully')
    }).catch((err) => {
      if (mountId !== mountCountRef.current) return
      console.error('[useJitViewer] mount failed:', err)
    })
  }, [fileName, type])

  useEffect(() => {
    let cancelled = false
    setBlob(null)
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.blob()
      })
      .then((b) => {
        if (!cancelled) setBlob(b)
      })
      .catch((err) => console.error('[useJitViewer] fetch failed:', err))
    return () => { cancelled = true }
  }, [url])

  useEffect(() => {
    if (!containerRef.current || !blob) return

    const container = containerRef.current

    const raf = requestAnimationFrame(() => {
      mountViewer(container, blob)
    })

    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0]!.contentRect
      if (width === 0 || height === 0) return

      if (type === 'xlsx') {
        if (resizeTimer) clearTimeout(resizeTimer)
        resizeTimer = setTimeout(() => {
          viewerRef.current?.destroy()
          viewerRef.current = null
          mountViewer(container, blob)
        }, 300)
      } else if (viewerRef.current) {
        void viewerRef.current.setOptions({ width: `${width}px`, height: `${height}px` })
      }
    })
    ro.observe(container)

    return () => {
      cancelAnimationFrame(raf)
      if (resizeTimer) clearTimeout(resizeTimer)
      ro.disconnect()
      viewerRef.current?.destroy()
      viewerRef.current = null
    }
  }, [blob, fileName, type, mountViewer])

  return containerRef
}
