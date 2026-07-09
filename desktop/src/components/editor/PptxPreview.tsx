import { useJitViewer } from './useJitViewer'

type Props = {
  url: string
  fileName: string
}

export function PptxPreview({ url, fileName }: Props) {
  const containerRef = useJitViewer('pptx', url, fileName)

  return (
    <div className="relative h-full">
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  )
}
