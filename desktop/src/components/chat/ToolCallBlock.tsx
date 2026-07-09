/**
 * ToolCallBlock — 工具调用块
 *
 * 参照 smart-code chat/ToolCallBlock.tsx，简化版。
 * 显示工具名称、输入摘要、运行状态、结果（可折叠）。
 */

import { useState } from 'react';
import { useTranslation } from '../../i18n';
import type { ToolCallInfo } from '../../types/chat';

const TOOL_ICONS: Record<string, JSX.Element> = {
  Bash: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
  Read: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  Write: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  ),
  Edit: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  Glob: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Grep: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  ),
};

const DEFAULT_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

function getToolSummary(toolName: string, input: Record<string, unknown>): string {
  const obj = input || {};
  switch (toolName) {
    case 'Bash':
      return typeof obj.command === 'string' ? obj.command : '';
    case 'Read':
      return typeof obj.file_path === 'string' ? obj.file_path : '';
    case 'Write':
      return typeof obj.file_path === 'string' ? obj.file_path : '';
    case 'Edit':
      return typeof obj.file_path === 'string' ? obj.file_path : '';
    case 'Glob':
      return typeof obj.pattern === 'string' ? obj.pattern : '';
    case 'Grep':
      return typeof obj.pattern === 'string' ? obj.pattern : '';
    default:
      return '';
  }
}

function getResultSummary(result: string, isError: boolean): string {
  if (!result) return '';
  if (isError) {
    const firstLine = result.split('\n').find((l) => l.trim()) || '';
    return firstLine.length <= 60 ? firstLine : firstLine.slice(0, 60) + '...';
  }
  const lineCount = result.split('\n').length;
  if (lineCount > 1) return `${lineCount} lines`;
  return result.length <= 40 ? result : result.slice(0, 40) + '...';
}

type Props = {
  toolCall: ToolCallInfo;
};

export function ToolCallBlock({ toolCall }: Props) {
  const t = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const { toolName, input, result, isError, status } = toolCall;
  const icon = TOOL_ICONS[toolName] || DEFAULT_ICON;
  const summary = getToolSummary(toolName, input);
  const resultSummary = result ? getResultSummary(result, isError ?? false) : '';

  const hasResult = Boolean(result);
  const expandable = hasResult || toolName === 'Edit' || toolName === 'Write';

  const statusColor =
    status === 'running'
      ? 'text-[var(--color-brand)]'
      : isError
        ? 'text-[var(--color-error)]'
        : 'text-[var(--color-text-tertiary)]';

  const statusText =
    status === 'running'
      ? t('tool.running')
      : isError
        ? t('tool.error')
        : t('tool.completed');

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-border)]/50 bg-[var(--color-surface-container-lowest)] mb-2 ml-10">
      <div
        role="button"
        tabIndex={0}
        onClick={() => expandable && setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (expandable && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${expandable ? 'cursor-pointer hover:bg-[var(--color-surface-hover)]/50' : ''}`}
      >
        <span className="text-[var(--color-text-tertiary)]">{icon}</span>
        <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">
          {toolName}
        </span>
        {summary ? (
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--color-text-tertiary)]">
            {summary.split(/[\\/]/).pop() || summary}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <span className={`shrink-0 text-[10px] ${statusColor}`}>
          {statusText}
        </span>
        {resultSummary && (
          <span className={`shrink-0 text-[10px] ${isError ? 'text-[var(--color-error)]' : 'text-[var(--color-text-tertiary)]'}`}>
            {resultSummary}
          </span>
        )}
        {expandable && (
          <span className="text-[14px] text-[var(--color-text-tertiary)]">
            {expanded ? '▸' : '▾'}
          </span>
        )}
      </div>

      {expandable && expanded && (
        <div className="space-y-2 border-t border-[var(--color-border)]/60 px-3 py-3">
          {/* Tool input */}
          {toolName !== 'Edit' && toolName !== 'Write' && (
            <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
              <div className="border-b border-[var(--color-border)]/60 px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
                {t('tool.toolInput')}
              </div>
              <pre className="px-3 py-2 font-mono text-[11px] text-[var(--color-text-secondary)] overflow-x-auto max-h-48 overflow-y-auto">
                {JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}

          {/* Bash command preview */}
          {toolName === 'Bash' && typeof input.command === 'string' && (
            <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
              <div className="px-3 py-2 font-mono text-[11px] text-[var(--color-text-secondary)]">
                <span className="text-[var(--color-brand)]">$</span> {input.command}
              </div>
            </div>
          )}

          {/* Edit diff preview */}
          {toolName === 'Edit' && typeof input.old_string === 'string' && typeof input.new_string === 'string' && (
            <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
              <div className="border-b border-[var(--color-border)]/60 px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
                {t('tool.updateFileContents')}
              </div>
              <pre className="px-3 py-2 font-mono text-[11px] overflow-x-auto max-h-48 overflow-y-auto">
                <span className="text-[var(--color-error)]">- {input.old_string}</span>
                {'\n'}
                <span className="text-[var(--color-success)]">+ {input.new_string}</span>
              </pre>
            </div>
          )}

          {/* Tool output */}
          {hasResult && (
            <div className={`overflow-hidden rounded-lg border ${isError ? 'border-[var(--color-error)]/20 bg-[var(--color-error)]/5' : 'border-[var(--color-border)] bg-[var(--color-surface)]'}`}>
              <div className="border-b border-[var(--color-border)]/60 px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
                {isError ? t('tool.errorOutput') : t('tool.toolOutput')}
              </div>
              <pre className="px-3 py-2 font-mono text-[11px] text-[var(--color-text-secondary)] overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-words">
                {result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
