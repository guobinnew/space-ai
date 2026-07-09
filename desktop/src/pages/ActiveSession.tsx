/**
 * ActiveSession — 活跃会话页面
 *
 * 参照 smart-code ActiveSession.tsx 复刻。
 * 左侧聊天面板 + 右侧文件浏览器面板（可切换/拖拽调整宽度）。
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useUIStore } from '../stores/uiStore';
import { useSessionStore } from '../stores/sessionStore';
import { useEditorStore } from '../stores/editorStore';
import { MessageList } from '../components/chat/MessageList';
import { ChatInput } from '../components/chat/ChatInput';
import { EditorPanel } from '../components/editor/EditorPanel';
import { useTranslation } from '../i18n';

const DEFAULT_CHAT_WIDTH = 540;
const MIN_EDITOR_WIDTH = 300;
const MIN_CHAT_WIDTH = 400;

export function ActiveSession({ sessionId }: { sessionId: string }) {
  const t = useTranslation();
  const { connectToSession, disconnectSession, sendMessage, stopGeneration, clearMessages, answerQuestion, respondPlan, getSession } = useChatStore();
  const { closeTab } = useUIStore();
  const { sessions, updateWorkDir } = useSessionStore();
  const setExplorerRoot = useEditorStore((s) => s.setExplorerRoot);
  const isConnectedRef = useRef(false);

  // Editor panel state
  const [editorOpen, setEditorOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(DEFAULT_CHAT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const chatWidthRef = useRef(chatWidth);
  chatWidthRef.current = chatWidth;

  const sessionState = getSession(sessionId);
  const isGenerating = sessionState.chatState === 'thinking' || sessionState.chatState === 'streaming';
  const isActive = sessionState.chatState !== 'idle';

  /** 格式化相对时间 */
  const formatRelativeTime = (isoTime: string): string => {
    const diff = Date.now() - new Date(isoTime).getTime()
    const seconds = Math.floor(diff / 1000)
    if (seconds < 60) return t('session.timeJustNow')
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return t('session.timeMinutes', { n: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('session.timeHours', { n: hours })
    const days = Math.floor(hours / 24)
    if (days < 7) return t('session.timeDays', { n: days })
    return new Date(isoTime).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  // Get session workDir
  const session = sessions.find((s) => s.id === sessionId);
  const workDir = session?.workDir || '';
  const hasMessages = (session?.messageCount ?? 0) > 0;

  // Sync workDir to editorStore explorerRoot
  useEffect(() => {
    setExplorerRoot(workDir || null);
  }, [workDir, setExplorerRoot]);

  // Only connect/disconnect when sessionId changes
  useEffect(() => {
    if (isConnectedRef.current) return
    isConnectedRef.current = true
    connectToSession(sessionId)
    return () => {
      isConnectedRef.current = false
      disconnectSession(sessionId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // Drag handler for resizing chat/editor split
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    setDragging(true);
    startX.current = e.clientX;
    startWidth.current = chatWidthRef.current;

    const handleDragMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const containerWidth = containerRef.current?.clientWidth ?? 0;
      const delta = ev.clientX - startX.current;
      const newChatWidth = Math.min(
        Math.max(MIN_CHAT_WIDTH, startWidth.current + delta),
        containerWidth - MIN_EDITOR_WIDTH,
      );
      setChatWidth(newChatWidth);
    };

    const handleDragEnd = () => {
      isDragging.current = false;
      setDragging(false);
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleSend = (content: string) => {
    sendMessage(sessionId, content);
  };

  const handleStop = () => {
    stopGeneration(sessionId);
  };

  const handleClose = () => {
    closeTab(sessionId);
  };

  const handlePickDir = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === 'string') {
        await updateWorkDir(sessionId, selected);
      }
    } catch {
      // Not in Tauri or dialog cancelled
    }
  }, [sessionId, updateWorkDir]);

  // Scroll-to-top / scroll-to-bottom ref
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scrolling, setScrolling] = useState<'top' | 'bottom' | null>(null);

  const finishScroll = useCallback(() => {
    setScrolling(null);
    scrollTimerRef.current = null;
  }, []);

  const scrollToTop = useCallback(() => {
    if (scrolling) return;
    const el = messagesContainerRef.current;
    if (!el) return;
    setScrolling('top');
    el.scrollTo({ top: 0, behavior: 'smooth' });
    scrollTimerRef.current = setTimeout(finishScroll, 500);
  }, [scrolling, finishScroll]);

  const scrollToBottom = useCallback(() => {
    if (scrolling) return;
    const el = messagesContainerRef.current;
    if (!el) return;
    setScrolling('bottom');
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    scrollTimerRef.current = setTimeout(finishScroll, 500);
  }, [scrolling, finishScroll]);

  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden bg-[var(--color-surface)]">
      {/* Drag overlay */}
      {dragging && <div className="absolute inset-0 z-50 cursor-col-resize" />}

      {/* Chat panel (left) */}
      <div
        className={`flex flex-col overflow-hidden ${editorOpen ? '' : 'flex-1'}`}
        style={editorOpen ? { width: chatWidth } : undefined}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)] flex-shrink-0">
          <div className="flex flex-col min-w-0 gap-0.5">
            <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
              {session?.title || t('session.title')}
            </span>
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-tertiary)]">
              {isActive && (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
                  <span>{t('session.active')}</span>
                </span>
              )}
              {session?.messageCount !== undefined && session.messageCount > 0 && (
                <>
                  {isActive && <span>·</span>}
                  <span>{t('session.messageCount', { count: session.messageCount })}</span>
                </>
              )}
              {session?.modifiedAt && (
                <>
                  <span>·</span>
                  <span>{formatRelativeTime(session.modifiedAt)}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Scroll to top */}
            <button
              onClick={scrollToTop}
              disabled={scrolling !== null}
              className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
                scrolling !== null
                  ? 'text-[var(--color-text-disabled)] opacity-30 cursor-not-allowed'
                  : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-secondary)]'
              }`}
              title={t('session.scrollToTop')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
            {/* Scroll to bottom */}
            <button
              onClick={scrollToBottom}
              disabled={scrolling !== null}
              className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
                scrolling !== null
                  ? 'text-[var(--color-text-disabled)] opacity-30 cursor-not-allowed'
                  : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-secondary)]'
              }`}
              title={t('session.scrollToBottom')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {/* Toggle editor panel */}
            {workDir && (
              <button
                onClick={() => setEditorOpen((v) => !v)}
                className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
                  editorOpen
                    ? 'bg-[var(--color-brand)]/10 text-[var(--color-brand)]'
                    : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-secondary)]'
                }`}
                title={editorOpen ? t('editor.closePanel') : t('editor.openPanel')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </button>
            )}
            {/* Clear session */}
            <button
              onClick={() => clearMessages(sessionId)}
              className="flex items-center justify-center rounded-md p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-warning)] transition-colors"
              title={t('session.clear')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
            <button
              onClick={handleClose}
              className="flex items-center justify-center rounded-md p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-error)] transition-colors"
              title={t('session.close')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4">
          <MessageList
            messages={sessionState.messages}
            streamingText={sessionState.streamingText}
            thinkingText={sessionState.thinkingText}
            chatState={sessionState.chatState}
            toolCalls={sessionState.toolCalls}
            pendingQuestion={sessionState.pendingQuestion}
            pendingPlan={sessionState.pendingPlan}
            onAnswerQuestion={(answer) => answerQuestion(sessionId, answer)}
            onRespondPlan={(response) => respondPlan(sessionId, response)}
          />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-[var(--color-border)] flex-shrink-0">
          <ChatInput
            onSend={handleSend}
            onStop={handleStop}
            isGenerating={isGenerating}
            usage={sessionState.usage}
          />
          {/* Work directory bar + disclaimer */}
          <div className="max-w-3xl mx-auto mt-2 px-1 flex items-center justify-between gap-3">
            <button
              onClick={hasMessages ? undefined : handlePickDir}
              disabled={isGenerating || hasMessages}
              className="flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-container)] text-left text-[11px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors disabled:cursor-not-allowed"
              title={hasMessages ? '已有消息，不可更改工作目录' : (workDir || '设置工作目录')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-text-tertiary)]">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span className="truncate max-w-[280px] sm:max-w-[360px]">
                {workDir || '设置工作目录'}
              </span>
            </button>
            <span className="text-[11px] text-[var(--color-text-tertiary)]/60 whitespace-nowrap">
              {t('chat.aiDisclaimer')}
            </span>
          </div>
        </div>
      </div>

      {/* Resize handle */}
      {editorOpen && (
        <div
          onMouseDown={handleDragStart}
          className="shrink-0 w-[3px] cursor-col-resize bg-transparent hover:bg-[var(--color-brand)]/30 active:bg-[var(--color-brand)]/50 transition-colors z-10"
        />
      )}

      {/* Editor panel (right) */}
      {editorOpen && workDir && (
        <div className="flex-1 min-w-0 overflow-hidden border-l border-[var(--color-border)]">
          <EditorPanel />
        </div>
      )}
    </div>
  );
}
