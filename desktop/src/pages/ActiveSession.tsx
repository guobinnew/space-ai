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
import { useTaskStore } from '../stores/cliTaskStore';
import { MessageList } from '../components/chat/MessageList';
import { ChatInput } from '../components/chat/ChatInput';
import { SessionTaskBar } from '../components/chat/SessionTaskBar';
import { QueryQueue } from '../components/chat/QueryQueue';
import { EditorPanel } from '../components/editor/EditorPanel';
import { Modal } from '../components/shared/Modal';
import { useTranslation } from '../i18n';

const DEFAULT_CHAT_WIDTH = 540;
const MIN_EDITOR_WIDTH = 400;
const MIN_CHAT_WIDTH = 400;

export function ActiveSession({ sessionId }: { sessionId: string }) {
  const t = useTranslation();
  const { connectToSession, disconnectSession, sendMessage, stopGeneration, clearMessages, answerQuestion, respondPlan, getSession } = useChatStore();
  const { closeTab } = useUIStore();
  const { sessions, updateWorkDir } = useSessionStore();
  const isConnectedRef = useRef(false);

  // Editor panel state
  const [editorOpen, setEditorOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(DEFAULT_CHAT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<'code' | 'office'>('code');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const {
    tasks: taskList,
    hasPending: _hasPending,
    nextPending,
    fetchSessionTasks,
    clearTasks,
  } = useTaskStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const chatWidthRef = useRef(chatWidth);
  chatWidthRef.current = chatWidth;

  // 打开会话时若检测到未完成任务清单，主动询问是否继续执行
  const [showContinuePrompt, setShowContinuePrompt] = useState(false);
  const askedRef = useRef(false);
  const promptActiveRef = useRef(false);
  const suppressAutoContinueRef = useRef(false);
  // 仅依据「打开会话时首次加载到的任务」决定是否询问，避免会话中途新建任务也弹窗
  const [firstLoadPending, setFirstLoadPending] = useState<boolean | null>(null);

  const sessionState = getSession(sessionId);
  const chatStateRef = useRef(sessionState.chatState); // latest agent chat state (avoid stale closure)
  chatStateRef.current = sessionState.chatState;
  const isGenerating = sessionState.chatState === 'thinking' || sessionState.chatState === 'streaming';
  const isActive = sessionState.chatState !== 'idle';
  const isEmpty = sessionState.messages.length === 0 && !isActive && !sessionState.streamingText;

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
  const hasMessages = sessionState.messages.length > 0;

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

  // Poll task list every 3s — always poll to detect pending tasks
  // even after agent goes idle (enables auto-continue)
  useEffect(() => {
    if (!sessionId) return
    let first = true
    const interval = setInterval(async () => {
      const data = await fetchSessionTasks(sessionId)
      if (first && data) {
        first = false
        // Capture whether there were incomplete tasks at open time
        setFirstLoadPending(data.hasPending)
      }
      // Auto-clear the task list once execution is fully finished:
      // no pending/in-progress tasks remain and the agent is idle.
      if (data && data.tasks.length > 0 && !data.hasPending && chatStateRef.current === 'idle') {
        await clearTasks(sessionId)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [sessionId, fetchSessionTasks, clearTasks])

  // When a session is opened with an incomplete task list (detected on the
  // first load), proactively ask the user whether to continue, instead of
  // auto-running the tasks.
  useEffect(() => {
    if (!sessionId) return
    if (askedRef.current) return
    if (firstLoadPending !== true) return
    if (sessionState.chatState !== 'idle') return
    askedRef.current = true
    promptActiveRef.current = true
    setShowContinuePrompt(true)
  }, [sessionId, firstLoadPending, sessionState.chatState])

  const handleContinueTasks = useCallback(() => {
    setShowContinuePrompt(false)
    promptActiveRef.current = false
    const next = nextPending ?? taskList.find((t) => t.status === 'in_progress')
    if (!next) return
    const msg = next.status === 'in_progress'
      ? `立即继续执行任务"${next.subject}"。直接调用所需工具完成剩余工作——不要只回复文字说明。只有当该任务确实已全部完成时，才调用 TaskUpdate 标记为 completed。`
      : `立即开始执行任务"${next.subject}"：先调用 TaskUpdate 标记为 in_progress，然后立即调用所需工具完成它——不要只回复文字说明。`
    sendMessage(sessionId, msg)
  }, [sessionId, nextPending, taskList, sendMessage])

  const handleDeclineTasks = useCallback(() => {
    setShowContinuePrompt(false)
    promptActiveRef.current = false
    // User chose not to continue — suppress background auto-continue for this open
    suppressAutoContinueRef.current = true
  }, [])

  // 任务续跑已移至服务端 agentic loop 内（llmStreamService 的 task-continue nudge）：
  // 当 agent 无工具调用结束但仍有 in_progress 任务时，在循环内注入 nudge 继续执行，
  // 比前端发起独立轮次更可靠（无 WS 往返/轮询延迟，也不会产生幽灵 user 消息）。
  // 此处不再做前端自动续跑；打开会话时的「是否继续」询问与手动「继续」按钮仍保留。

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
              <span className="ml-2 text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-[var(--color-brand)]/10 text-[var(--color-brand)] align-middle">
                {mode === 'code' ? '代码开发' : '日常办公'}
              </span>
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
              onClick={() => setShowClearConfirm(true)}
              disabled={!hasMessages}
              className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
                hasMessages
                  ? 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-warning)]'
                  : 'text-[var(--color-text-disabled)] opacity-30 cursor-not-allowed'
              }`}
              title={hasMessages ? t('session.clear') : t('session.noMessages')}
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

        {/* Empty state: welcome screen with mode selector */}
        {isEmpty ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-8 py-8">
              <div className="flex max-w-md flex-col items-center text-center">
                <div
                  className="mb-6 h-20 w-20 rounded-[22px] flex items-center justify-center text-white text-3xl font-bold"
                  style={{ background: 'var(--gradient-btn-primary)', boxShadow: 'var(--shadow-dropdown)' }}
                >
                  S
                </div>
                <h1 className="mb-2 text-3xl font-bold tracking-tight text-[var(--color-text-primary)]" style={{ fontFamily: 'var(--font-headline)' }}>
                  {t('empty.title')}
                </h1>
                <p className="text-base text-[var(--color-text-secondary)]">
                 {t('empty.readyMessage')}
                </p>
                <p className="mt-4 text-xs text-[var(--color-text-tertiary)]">选择工作模式，切换 AI 专注领域</p>

                {/* Mode switcher */}
                <div className="mt-3 inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-1">
                  <button
                    onClick={() => setMode('code')}
                    className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${mode === 'code' ? 'text-white' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
                    style={mode === 'code' ? { background: 'var(--gradient-btn-primary)' } : undefined}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
                    代码开发
                  </button>
                  <button
                    onClick={() => setMode('office')}
                    className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${mode === 'office' ? 'text-white' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
                    style={mode === 'office' ? { background: 'var(--gradient-btn-primary)' } : undefined}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                    日常办公
                  </button>
                </div>

                <p className="mt-4 text-sm text-[var(--color-text-tertiary)]">
                  {mode === 'code' ? '专注于代码编写、调试和架构设计' : '专注于文档撰写、数据分析和日常任务'}
                </p>
              </div>
            </div>

            {/* Input area for empty state */}
            <div className="px-4 py-3 border-t border-[var(--color-border)] flex-shrink-0">
              <ChatInput
                onSend={handleSend}
                onStop={handleStop}
                isGenerating={isGenerating}
                usage={sessionState.usage}
                totalUsage={sessionState.totalUsage}
                placeholder={t('empty.placeholder')}
              />
              {/* Work directory bar + disclaimer */}
              <div className="max-w-3xl mx-auto mt-2 px-1 flex items-center justify-between gap-3">
                <div
                  onClick={!hasMessages && !isGenerating ? handlePickDir : undefined}
                  className={`flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-container)] text-[11px] text-[var(--color-text-secondary)] select-text transition-colors hover:bg-[var(--color-surface-hover)] ${!hasMessages && !isGenerating ? 'cursor-pointer' : 'cursor-default'}`}
                  title={hasMessages ? '已有消息，不可更改工作目录' : (workDir || '设置工作目录')}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-text-tertiary)]"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                  <span className="truncate max-w-[280px] sm:max-w-[360px] select-text">{workDir || '设置工作目录'}</span>
                </div>
                <span className="text-[11px] text-[var(--color-text-tertiary)]/60 whitespace-nowrap">{t('chat.aiDisclaimer')}</span>
              </div>
            </div>
          </div>
        ) : (
          <>
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

            {/* Query queue + Task bar (above input, below messages) */}
            <QueryQueue sessionId={sessionId} />
            <SessionTaskBar sessionId={sessionId} />

            {/* 打开会话且有未完成任务时，主动询问是否继续执行任务清单 */}
            {showContinuePrompt && (
              <div className="px-4 pb-2 flex-shrink-0">
                <div className="mx-auto max-w-3xl flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-secondary)] shrink-0"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                    <span>检测到未完成的任务清单，是否继续执行？</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={handleContinueTasks}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                      style={{ background: 'var(--gradient-btn-primary)' }}
                    >
                      继续
                    </button>
                    <button
                      onClick={handleDeclineTasks}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium border border-[var(--color-border)] bg-[var(--color-surface-container)] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                    >
                      暂不执行
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Input */}
            <div className="px-4 py-3 border-t border-[var(--color-border)] flex-shrink-0">
              <ChatInput
                onSend={handleSend}
                onStop={handleStop}
                isGenerating={isGenerating}
                usage={sessionState.usage}
                totalUsage={sessionState.totalUsage}
              />
              {/* Work directory bar + disclaimer */}
              <div className="max-w-3xl mx-auto mt-2 px-1 flex items-center justify-between gap-3">
                <div
                  onClick={!hasMessages && !isGenerating ? handlePickDir : undefined}
                  className={`flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-container)] text-[11px] text-[var(--color-text-secondary)] select-text transition-colors hover:bg-[var(--color-surface-hover)] ${!hasMessages && !isGenerating ? 'cursor-pointer' : 'cursor-default'}`}
                  title={hasMessages ? '已有消息，不可更改工作目录' : (workDir || '设置工作目录')}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-text-tertiary)]">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  <span className="truncate max-w-[280px] sm:max-w-[360px] select-text">
                    {workDir || '设置工作目录'}
                  </span>
                </div>
                <span className="text-[11px] text-[var(--color-text-tertiary)]/60 whitespace-nowrap">
                  {t('chat.aiDisclaimer')}
                </span>
              </div>
            </div>
          </>
        )}
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
          <EditorPanel rootDir={workDir} />
        </div>
      )}

      {/* Clear session confirmation dialog */}
      <Modal
        open={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        title={t('session.clear')}
        width={420}
        footer={
          <>
            <button
              onClick={() => setShowClearConfirm(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={() => {
                clearMessages(sessionId);
                setShowClearConfirm(false);
              }}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
              style={{ background: 'var(--color-warning)' }}
            >
              {t('common.confirm')}
            </button>
          </>
        }
      >
        <p className="text-sm text-[var(--color-text-secondary)]">
          {t('session.clearConfirm')}
        </p>
      </Modal>
    </div>
  );
}
