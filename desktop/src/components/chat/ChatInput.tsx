/**
 * ChatInput — 聊天输入框
 *
 * 参照 smart-code chat/ChatInput.tsx 复刻。
 * 支持文件/目录/代码引用的可视化标签显示。
 */

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from '../../i18n';
import { providersApi } from '../../api/providers';
import { filesystemApi } from '../../api/filesystem';
import { usePendingRefStore } from '../../stores/pendingRefStore';
import { Tooltip } from '../shared/Tooltip';
import type { SavedProvider } from '../../types/provider';

/** 默认上下文窗口大小（用于计算占比） */
const DEFAULT_CONTEXT_LIMIT = 200000;

type CodeRefTag = { id: string; fileName: string; filePath: string; startLine: number; endLine: number };
type FileRefTag = { id: string; fileName: string; filePath: string };
type DirRefTag = { id: string; dirName: string; dirPath: string };

type ChatInputProps = {
  onSend: (content: string) => void;
  onStop: () => void;
  isGenerating: boolean;
  disabled?: boolean;
  usage?: { inputTokens: number; outputTokens: number } | null;
  placeholder?: string;
};

type ActiveProvider = Pick<SavedProvider, 'id' | 'name' | 'models' | 'apiFormat'> & { models: { main: string } };

let refCounter = 0;

export function ChatInput({ onSend, onStop, isGenerating, disabled, usage, placeholder }: ChatInputProps) {
  const t = useTranslation();
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeProvider, setActiveProvider] = useState<ActiveProvider | null>(null);
  const [codeRefs, setCodeRefs] = useState<CodeRefTag[]>([]);
  const [fileRefs, setFileRefs] = useState<FileRefTag[]>([]);
  const [dirRefs, setDirRefs] = useState<DirRefTag[]>([]);
  const { pendingFileRef, pendingDirRef, pendingCodeRef, clearPendingFileRef, clearPendingDirRef, clearPendingCodeRef } = usePendingRefStore();

  useEffect(() => {
    void providersApi.list().then(({ providers, activeId }) => {
      const active = providers.find((p) => p.id === activeId);
      if (active) {
        setActiveProvider({
          id: active.id,
          name: active.name,
          models: active.models,
          apiFormat: active.apiFormat,
        });
      }
    }).catch(() => {});
  }, []);

  // Consume pending file ref → show as tag (do NOT read content until send)
  useEffect(() => {
    if (!pendingFileRef) return;
    const { fileName, filePath } = pendingFileRef;
    clearPendingFileRef();
    setFileRefs((prev) => {
      if (prev.some((r) => r.filePath === filePath)) return prev;
      return [...prev, { id: `ref-${++refCounter}`, fileName, filePath }];
    });
    textareaRef.current?.focus();
  }, [pendingFileRef, clearPendingFileRef]);

  // Consume pending dir ref → show as tag
  useEffect(() => {
    if (!pendingDirRef) return;
    const { dirName, dirPath } = pendingDirRef;
    clearPendingDirRef();
    setDirRefs((prev) => {
      if (prev.some((r) => r.dirPath === dirPath)) return prev;
      return [...prev, { id: `ref-${++refCounter}`, dirName, dirPath }];
    });
    textareaRef.current?.focus();
  }, [pendingDirRef, clearPendingDirRef]);

  // Consume pending code ref → show as tag (do NOT read file until send)
  useEffect(() => {
    if (!pendingCodeRef) return;
    const { fileName, filePath, startLine, endLine } = pendingCodeRef;
    clearPendingCodeRef();
    setCodeRefs((prev) => {
      if (prev.some((r) => r.filePath === filePath && r.startLine === startLine)) return prev;
      return [...prev, { id: `ref-${++refCounter}`, fileName, filePath, startLine, endLine }];
    });
    textareaRef.current?.focus();
  }, [pendingCodeRef, clearPendingCodeRef]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [input]);

  const handleSubmit = async () => {
    let text = input.trim();
    if (!text || isGenerating || disabled) return;

    // Build reference blocks from visual tags (read file contents)
    const refBlocks: string[] = [];

    // Code refs: read file and extract selected lines
    for (const ref of codeRefs) {
      try {
        const result = await filesystemApi.readFile(ref.filePath);
        const lines = result.content.split('\n');
        const selected = lines.slice(ref.startLine - 1, ref.endLine).join('\n');
        refBlocks.push(`File: ${ref.filePath} (L${ref.startLine}-L${ref.endLine})\n\`\`\`\n${selected}\n\`\`\``);
      } catch {
        refBlocks.push(`[File: ${ref.filePath} (L${ref.startLine}-L${ref.endLine})]`);
      }
    }

    // File refs: read full file content
    for (const ref of fileRefs) {
      try {
        const result = await filesystemApi.readFile(ref.filePath);
        refBlocks.push(`File: ${ref.filePath}\n\`\`\`\n${result.content}\n\`\`\``);
      } catch {
        refBlocks.push(`[File: ${ref.filePath}]`);
      }
    }

    // Dir refs: just add path reference
    for (const ref of dirRefs) {
      refBlocks.push(`[Directory: ${ref.dirPath}]`);
    }

    if (refBlocks.length > 0) {
      text = text + '\n\n---\n' + refBlocks.join('\n\n');
    }

    onSend(text);
    setInput('');
    setCodeRefs([]);
    setFileRefs([]);
    setDirRefs([]);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  // Context usage
  const contextTokens = usage?.inputTokens || 0;
  const contextPercent = Math.min(100, Math.round((contextTokens / DEFAULT_CONTEXT_LIMIT) * 100));
  const contextColor =
    contextPercent > 80 ? 'var(--color-error)' :
    contextPercent > 50 ? 'var(--color-warning)' :
    'var(--color-brand)';
  const modelName = activeProvider?.models?.main || '';

  /** Render a single ref tag badge */
  const RefTag = ({ icon, label, path, onRemove }: { icon: string; label: string; path: string; onRemove: () => void }) => (
    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--color-brand)]/10 border border-[var(--color-brand)]/30 px-2 py-0.5 text-[11px] font-medium text-[var(--color-brand)] max-w-[240px] overflow-hidden">
      <span className="text-[12px] flex-shrink-0">{icon}</span>
      <Tooltip content={path} className="min-w-0 overflow-hidden">
        <span className="truncate min-w-0">{label}</span>
      </Tooltip>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 flex items-center justify-center w-3.5 h-3.5 rounded-sm hover:bg-[var(--color-brand)]/20 transition-colors"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </span>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] focus-within:border-[var(--color-border-focus)] transition-colors overflow-hidden">
        {/* Ref tags */}
        <div className="px-3 pt-3 pb-0">
          {codeRefs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pb-2">
              {codeRefs.map((ref) => (
                <RefTag
                  key={ref.id}
                  icon="<>"
                  label={`${ref.fileName} L${ref.startLine}${ref.endLine !== ref.startLine ? `-${ref.endLine}` : ''}`}
                  path={ref.filePath}
                  onRemove={() => setCodeRefs((prev) => prev.filter((r) => r.id !== ref.id))}
                />
              ))}
            </div>
          )}
          {dirRefs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pb-2">
              {dirRefs.map((ref) => (
                <RefTag
                  key={ref.id}
                  icon="📁"
                  label={ref.dirName}
                  path={ref.dirPath}
                  onRemove={() => setDirRefs((prev) => prev.filter((r) => r.id !== ref.id))}
                />
              ))}
            </div>
          )}
          {fileRefs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pb-2">
              {fileRefs.map((ref) => (
                <RefTag
                  key={ref.id}
                  icon="📄"
                  label={ref.fileName}
                  path={ref.filePath}
                  onRemove={() => setFileRefs((prev) => prev.filter((r) => r.id !== ref.id))}
                />
              ))}
            </div>
          )}
        </div>

        {/* Textarea */}
        <div className="p-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className="w-full resize-none border-0 bg-transparent text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)] disabled:opacity-50"
            placeholder={placeholder || t('session.placeholder')}
            rows={1}
            style={{ maxHeight: '120px' }}
          />
        </div>

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--color-border)] bg-[var(--color-surface-container-lowest)]">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {modelName && (
              <span className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md text-[var(--color-text-tertiary)] bg-[var(--color-surface-container-high)] flex-shrink-0">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="9" y1="9" x2="15" y2="9" />
                  <line x1="9" y1="13" x2="15" y2="13" />
                </svg>
                <span className="truncate max-w-[100px]">{modelName}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {usage && (
              <div className="flex items-center gap-1.5" title={`${contextTokens.toLocaleString()} / ${DEFAULT_CONTEXT_LIMIT.toLocaleString()} tokens`}>
                <div className="w-16 h-1.5 rounded-full bg-[var(--color-surface-container-high)] overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${contextPercent}%`, background: contextColor }} />
                </div>
                <span className="text-[10px] text-[var(--color-text-tertiary)] tabular-nums">{contextPercent}%</span>
              </div>
            )}

            {isGenerating ? (
              <button
                onClick={onStop}
                className="flex items-center justify-center rounded-lg p-1.5 text-xs font-semibold transition-all"
                style={{ background: '#DC2626', color: 'white' }}
                title={t('session.stop')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              </button>
            ) : (
              <button
                onClick={() => void handleSubmit()}
                disabled={!input.trim() && codeRefs.length === 0 && fileRefs.length === 0 && dirRefs.length === 0 || disabled}
                className="flex items-center justify-center rounded-lg p-1.5 text-xs font-semibold transition-all hover:brightness-105 disabled:opacity-30"
                style={{ background: 'var(--gradient-btn-primary)', color: 'var(--color-btn-primary-fg)', boxShadow: 'var(--shadow-button-primary)' }}
                title={t('session.send')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
