import { useJitViewer } from './useJitViewer'

type Props = {
  url: string
  fileName: string
}

export function XlsxPreview({ url, fileName }: Props) {
  const containerRef = useJitViewer('xlsx', url, fileName)

  return (
    <div className="relative h-full">
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  )
}
