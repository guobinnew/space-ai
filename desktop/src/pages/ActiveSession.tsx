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
import { MessageList } from '../components/chat/MessageList';
import { ChatInput } from '../components/chat/ChatInput';
import { EditorPanel } from '../components/filesystem/EditorPanel';
import { useTranslation } from '../i18n';

const DEFAULT_CHAT_WIDTH = 540;
const MIN_EDITOR_WIDTH = 300;
const MIN_CHAT_WIDTH = 400;

export function ActiveSession({ sessionId }: { sessionId: string }) {
  const t = useTranslation();
  const { connectToSession, disconnectSession, sendMessage, stopGeneration, answerQuestion, respondPlan, getSession } = useChatStore();
  const { closeTab } = useUIStore();
  const { sessions } = useSessionStore();
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

  // Get session workDir
  const session = sessions.find((s) => s.id === sessionId);
  const workDir = session?.workDir || '';

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
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)] flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
              {session?.title || t('session.title')}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
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
        <div className="flex-1 overflow-y-auto px-4">
          <MessageList
            messages={sessionState.messages}
            streamingText={sessionState.streamingText}
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
            sessionId={sessionId}
            onSend={handleSend}
            onStop={handleStop}
            isGenerating={isGenerating}
            usage={sessionState.usage}
          />
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
          <EditorPanel rootPath={workDir} />
        </div>
      )}
    </div>
  );
}
