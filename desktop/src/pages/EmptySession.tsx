/**
 * EmptySession — 空会话页面
 *
 * 显示欢迎信息 + 工作模式选择 + 输入框。
 * 输入后创建新会话并连接 WS。
 */

import { useState, useRef } from 'react';
import { useTranslation } from '../i18n';
import { useSessionStore } from '../stores/sessionStore';
import { useChatStore } from '../stores/chatStore';
import { useUIStore } from '../stores/uiStore';

type WorkMode = 'code' | 'office';

const modeDesc: Record<WorkMode, string> = {
  code: '专注于代码编写、调试和架构设计',
  office: '专注于文档撰写、数据分析和日常任务',
};

export function EmptySession() {
  const t = useTranslation();
  const { createSession } = useSessionStore();
  const { connectToSession, sendMessage } = useChatStore();
  const { openTab, defaultWorkDir } = useUIStore();
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<WorkMode>('code');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const sessionId = await createSession(defaultWorkDir || undefined);
      openTab(sessionId, '新会话', 'session');
      connectToSession(sessionId);
      setTimeout(() => {
        sendMessage(sessionId, text);
      }, 300);
    } catch (err) {
      console.error('Failed to create session:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--color-surface)]">
      {/* Center content */}
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-8 py-8">
        <div className="flex flex-col items-center gap-6">
          <div className="flex max-w-md flex-col items-center text-center">
            {/* Author image */}
            <img
              src="/author.png"
              alt={t('app.name')}
              className="mb-6 h-28 w-auto"
            />
            <h1
              className="mb-2 text-3xl font-bold tracking-tight text-[var(--color-text-primary)]"
              style={{ fontFamily: 'var(--font-headline)' }}
            >
              {t('empty.title')}
            </h1>
            <p className="text-base text-[var(--color-text-secondary)]">
              {t('empty.readyMessage')}
            </p>
            <p className="mt-4 text-xs text-[var(--color-text-tertiary)]">
              选择工作模式，切换 AI 专注领域
            </p>

            {/* Mode switcher */}
            <div className="mt-3 inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-1">
              <button
                onClick={() => setMode('code')}
                className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  mode === 'code'
                    ? 'text-white'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
                style={mode === 'code' ? { background: 'var(--gradient-btn-primary)' } : undefined}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
                代码开发
              </button>
              <button
                onClick={() => setMode('office')}
                className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  mode === 'office'
                    ? 'text-white'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
                style={mode === 'office' ? { background: 'var(--gradient-btn-primary)' } : undefined}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                日常办公
              </button>
            </div>

            {/* Mode description */}
            <p className="mt-4 text-sm text-[var(--color-text-tertiary)]">
              {modeDesc[mode]}
            </p>
          </div>
        </div>
      </div>

      {/* Input area */}
      <div className="flex justify-center px-8 pb-6">
        <div className="w-full max-w-3xl">
          <div className="flex items-end gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-3 focus-within:border-[var(--color-border-focus)] transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 resize-none border-0 bg-transparent text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)]"
              placeholder={t('empty.placeholder')}
              rows={2}
              style={{ maxHeight: '120px' }}
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isSubmitting}
              className="flex-shrink-0 px-4 py-1.5 text-xs font-semibold rounded-lg text-[var(--color-btn-primary-fg)] transition-all hover:brightness-105 disabled:opacity-30"
              style={{ background: 'var(--gradient-btn-primary)', boxShadow: 'var(--shadow-button-primary)' }}
            >
              {isSubmitting ? t('chat.creating') : t('session.send')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
