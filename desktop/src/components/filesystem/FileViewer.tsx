/**
 * FileViewer — 文件查看器
 *
 * 参照 smart-code editor/CodeViewer，简化版。
 * 只读显示文件内容，带行号。
 */

import { useState, useEffect, useRef } from 'react';
import { filesystemApi, type FileContent } from '../../api/filesystem';

type Props = {
  filePath: string;
  fileName: string;
};

export function FileViewer({ filePath, fileName }: Props) {
  const [content, setContent] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    filesystemApi.read(filePath)
      .then((data) => {
        if (cancelled) return;
        setContent(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '读取失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [filePath]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] flex-shrink-0">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-tertiary)] flex-shrink-0">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span className="text-xs font-medium text-[var(--color-text-primary)] truncate" title={filePath}>
          {fileName}
        </span>
        {content && (
          <span className="text-[10px] text-[var(--color-text-tertiary)] flex-shrink-0">
            {content.totalLines} lines
          </span>
        )}
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-auto bg-[var(--color-surface)]">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-4 h-4 border-2 border-[var(--color-brand)] border-t-transparent rounded-full" />
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-xs text-[var(--color-error)] text-center">
            {error}
          </div>
        ) : content ? (
          <pre className="font-mono text-[11px] leading-[1.5] text-[var(--color-text-primary)] p-0 m-0">
            <code>{content.content}</code>
          </pre>
        ) : null}
      </div>
    </div>
  );
}
