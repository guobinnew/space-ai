import { useJitViewer } from './useJitViewer'

type Props = {
  url: string
  fileName: string
}

export function DocxPreview({ url, fileName }: Props) {
  const containerRef = useJitViewer('docx', url, fileName)

  return (
    <div className="relative h-full">
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  )
}
