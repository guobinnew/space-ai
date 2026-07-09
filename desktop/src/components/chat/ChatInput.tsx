/**
 * ChatInput — 聊天输入框
 *
 * 参照 smart-code chat/ChatInput.tsx 复刻，简化版。
 * 支持工作目录设置、模型显示、上下文使用占比。
 */

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from '../../i18n';
import { providersApi } from '../../api/providers';
import type { SavedProvider } from '../../types/provider';

/** 默认上下文窗口大小（用于计算占比） */
const DEFAULT_CONTEXT_LIMIT = 200000;

type ChatInputProps = {
  onSend: (content: string) => void;
  onStop: () => void;
  isGenerating: boolean;
  disabled?: boolean;
  /** 上下文使用量（来自 chatStore） */
  usage?: { inputTokens: number; outputTokens: number } | null;
};

type ActiveProvider = Pick<SavedProvider, 'id' | 'name' | 'models' | 'apiFormat'> & { models: { main: string } };

export function ChatInput({ onSend, onStop, isGenerating, disabled, usage }: ChatInputProps) {
  const t = useTranslation();
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeProvider, setActiveProvider] = useState<ActiveProvider | null>(null);

  // 加载活跃 provider 信息
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

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [input]);

  const handleSubmit = () => {
    const text = input.trim();
    if (!text || isGenerating || disabled) return;
    onSend(text);
    setInput('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // 上下文占比计算
  const contextTokens = usage?.inputTokens || 0;
  const contextPercent = Math.min(100, Math.round((contextTokens / DEFAULT_CONTEXT_LIMIT) * 100));
  const contextColor =
    contextPercent > 80 ? 'var(--color-error)' :
    contextPercent > 50 ? 'var(--color-warning)' :
    'var(--color-brand)';

  // 模型显示名称
  const modelName = activeProvider?.models?.main || '';

  return (
    <div className="max-w-3xl mx-auto">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] focus-within:border-[var(--color-border-focus)] transition-colors overflow-hidden">
        {/* Textarea */}
        <div className="p-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className="w-full resize-none border-0 bg-transparent text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)] disabled:opacity-50"
            placeholder={t('session.placeholder')}
            rows={1}
            style={{ maxHeight: '120px' }}
          />
        </div>

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--color-border)] bg-[var(--color-surface-container-lowest)]">
          {/* Left: model display */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Model display */}
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

          {/* Right: context usage + send button */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Context usage */}
            {usage && (
              <div className="flex items-center gap-1.5" title={`${contextTokens.toLocaleString()} / ${DEFAULT_CONTEXT_LIMIT.toLocaleString()} tokens`}>
                <div className="w-16 h-1.5 rounded-full bg-[var(--color-surface-container-high)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${contextPercent}%`, background: contextColor }}
                  />
                </div>
                <span className="text-[10px] text-[var(--color-text-tertiary)] tabular-nums">
                  {contextPercent}%
                </span>
              </div>
            )}

            {/* Send / Stop button */}
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
                onClick={handleSubmit}
                disabled={!input.trim() || disabled}
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
