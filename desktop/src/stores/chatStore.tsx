/**
 * Chat Store — 聊天流式状态管理
 *
 * 参照 smart-code chatStore.ts 复刻，简化版。
 * 每个会话维护独立的消息列表和流式状态。
 * 通过 WebSocket 与 Server sidecar 通信，Server sidecar 内部为每个会话
 * 启动 CLI sidecar 子进程(Bun.spawn)并桥接 WS 通信。
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { wsManager, type ServerMessage } from '../api/websocket';
import { sessionsApi } from '../api/sessions';
import { tasksApi } from '../api/tasks';
import { getServerPort } from '../api/serverPort';
import { useUIStore } from './uiStore';
import type { UIMessage, PerSessionChatState, QuestionItem, QueuedQuery } from '../types/chat';

/**
 * Check if system notification should be sent when a session completes.
 * Only fires when: notifyOnCompletion is enabled AND the window is not focused.
 */
async function maybeNotifyCompletion(enabled: boolean, _sessionId: string, _text: string): Promise<void> {
  try {
    if (!enabled) return;

    // Check window focus state via Tauri
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    const focused = await win.isFocused();
    if (focused) return;

    // Send notification
    const { sendNotification } = await import('@tauri-apps/plugin-notification');
    sendNotification({
      title: 'Smart Lab',
      body: '会话回复已完成',
    });
  } catch {
    // Not in Tauri or notification unavailable — silently ignore
  }
}

interface ChatStoreState {
  sessions: Record<string, PerSessionChatState>;
  connectToSession: (sessionId: string) => void;
  disconnectSession: (sessionId: string) => void;
  sendMessage: (sessionId: string, content: string) => void;
  stopGeneration: (sessionId: string) => void;
  clearMessages: (sessionId: string) => void;
  answerQuestion: (sessionId: string, answer: string) => void;
  respondPlan: (sessionId: string, response: string) => void;
  getSession: (sessionId: string) => PerSessionChatState;
  loadHistory: (sessionId: string) => Promise<void>;
  /** 排队查询 */
  addQueuedQuery: (sessionId: string, content: string) => void;
  removeQueuedQuery: (sessionId: string, queryId: string) => void;
  reorderQueuedQueries: (sessionId: string, queries: QueuedQuery[]) => void;
  executeQueryNow: (sessionId: string, queryId: string) => void;
}

const ChatContext = createContext<ChatStoreState | null>(null);

function createInitialSessionState(): PerSessionChatState {
  return {
    messages: [],
    chatState: 'idle',
    streamingText: '',
    thinkingText: '',
    hasActiveThinking: false,
    toolCalls: [],
    pendingQuestion: null,
    pendingPlan: null,
    usage: null,
    totalUsage: { totalInput: 0, totalOutput: 0, totalCacheRead: 0, totalCacheCreation: 0 },
    queuedQueries: [],
  };
}

/** Flush accumulated thinking text into a message. */
function flushThinking(prev: PerSessionChatState): PerSessionChatState {
  if (!prev.hasActiveThinking || !prev.thinkingText.trim()) {
    return { ...prev, hasActiveThinking: false, thinkingText: '' };
  }
  const text = prev.thinkingText.trimStart();
  // Skip if content is only synthetic tool execution info (starts with [Tool:)
  if (text.startsWith('[Tool:')) {
    return { ...prev, hasActiveThinking: false, thinkingText: '' };
  }
  const thinkingMsg: UIMessage = {
    type: 'thinking',
    id: `thinking-${Date.now()}`,
    content: prev.thinkingText,
    createdAt: new Date().toISOString(),
  };
  return {
    ...prev,
    messages: [...prev.messages, thinkingMsg],
    thinkingText: '',
    hasActiveThinking: false,
  };
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Record<string, PerSessionChatState>>({});
  // 通用设置统一存储在 ~/.spaceai/settings.json，通过 uiStore 读取
  const { notifyOnCompletion } = useUIStore();

  const getSession = useCallback(
    (sessionId: string): PerSessionChatState => {
      return sessions[sessionId] || createInitialSessionState();
    },
    [sessions],
  );

  const updateSession = useCallback(
    (sessionId: string, updater: (prev: PerSessionChatState) => PerSessionChatState) => {
      setSessions((prev) => ({
        ...prev,
        [sessionId]: updater(prev[sessionId] || createInitialSessionState()),
      }));
    },
    [],
  );

  const loadHistory = useCallback(
    async (sessionId: string) => {
      try {
        const data = await sessionsApi.getMessages(sessionId);
        const uiMessages: UIMessage[] = [];
        for (const m of data.messages) {
          // User message
          if (m.role === 'user') {
            uiMessages.push({ type: 'user_text', id: m.id, content: m.content, createdAt: m.createdAt });
            continue;
          }

          // Assistant message: reconstruct thinking + tool calls + text
          const tc = (m as any).toolCalls as Array<{ id: string; toolName: string; input: Record<string, unknown>; result?: string; isError?: boolean }> | undefined;
          const thinking = (m as any).thinking as string | undefined;

          // Add thinking block if present
          if (thinking) {
            uiMessages.push({
              type: 'thinking',
              id: `${m.id}-thinking`,
              content: thinking,
              createdAt: m.createdAt,
            });
          }

          // Add tool_use and tool_result for each tool call
          if (tc && tc.length > 0) {
            for (const toolCall of tc) {
              uiMessages.push({
                type: 'tool_use',
                id: `${m.id}-tool_use-${toolCall.id}`,
                toolCallId: toolCall.id,
                toolName: toolCall.toolName,
                input: toolCall.input,
                createdAt: m.createdAt,
              });
              if (toolCall.result !== undefined) {
                uiMessages.push({
                  type: 'tool_result',
                  id: `${m.id}-tool_result-${toolCall.id}`,
                  toolCallId: toolCall.id,
                  toolName: toolCall.toolName,
                  result: toolCall.result,
                  isError: toolCall.isError || false,
                  createdAt: m.createdAt,
                });
              }
            }
          }

          // Add assistant text
          if (m.content) {
            uiMessages.push({ type: 'assistant_text', id: m.id, content: m.content, createdAt: m.createdAt });
          }
        }
        updateSession(sessionId, (prev) => ({ ...prev, messages: uiMessages }));
      } catch {
        // Ignore load errors
      }
    },
    [updateSession],
  );

  const connectToSession = useCallback(
    (sessionId: string) => {
      // Clear stale handlers from any previous connection attempt.
      // (Done here instead of disconnectSession to survive StrictMode remounts.)
      wsManager.clearHandlers(sessionId);

      // Connect to the single Server sidecar (dynamic port).
      // The Server sidecar will spawn a CLI sidecar for this session internally.
      void (async () => {
        const port = await getServerPort();
        wsManager.connect(sessionId, port);
      })();

      // Load history
      void loadHistory(sessionId);



      // Register message handler
      wsManager.onMessage(sessionId, (msg: ServerMessage) => {
        switch (msg.type) {
          case 'content_start':
            updateSession(sessionId, (prev) => {
              const flushed = flushThinking(prev);
              return {
                ...flushed,
                chatState: 'streaming',
                streamingText: '',
              };
            });
            break;

          case 'content_delta':
            updateSession(sessionId, (prev) => {
              const flushed = flushThinking(prev);
              return {
                ...flushed,
                streamingText: flushed.streamingText + msg.text,
              };
            });
            break;

          case 'thinking_delta':
            updateSession(sessionId, (prev) => {
              const prevText = prev.thinkingText;
              const delta = msg.text;
              // Guard against API proxies that resend accumulated thinking text
              // instead of incremental deltas. Without this the displayed text
              // doubles on every event and grows without bound.
              if (prevText.length > 0) {
                // delta contains everything we already have — either a growing
                // accumulated resend (delta ⊇ prev) or an identical stall resend.
                // Replace instead of append to avoid duplication.
                if (delta.length >= prevText.length && delta.startsWith(prevText)) {
                  return { ...prev, thinkingText: delta, hasActiveThinking: true };
                }
                // delta is a large prefix of what we already have — old content
                // being resent. Skip it entirely (only for substantial chunks to
                // avoid dropping genuine short incremental fragments).
                if (delta.length >= 16 && prevText.length > delta.length && prevText.startsWith(delta)) {
                  return prev;
                }
              }
              // Safety valve: if thinking already exceeds a generous cap, stop
              // accumulating to prevent runaway growth from any unforeseen proxy
              // behavior. (Legit thinking is bounded by the server's thinking
              // token budget, so this only ever catches dedup failures.)
              if (prevText.length > 200000) {
                return prev;
              }
              return {
                ...prev,
                thinkingText: prevText + delta,
                hasActiveThinking: true,
              };
            });
            break;

          case 'status':
            updateSession(sessionId, (prev) => {
              if (msg.state === 'thinking') {
                // New agentic loop round starting — flush pending thinking,
                // save accumulated streaming text as a message, and clear it
                // so it doesn't accumulate across rounds.
                const flushed = flushThinking(prev);
                const messages = [...flushed.messages];
                if (flushed.streamingText) {
                  messages.push({
                    type: 'assistant_text',
                    id: `assistant-${Date.now()}`,
                    content: flushed.streamingText,
                    createdAt: new Date().toISOString(),
                  });
                }
                return {
                  ...flushed,
                  messages,
                  streamingText: '',
                  chatState: msg.state,
                };
              }
              return { ...prev, chatState: msg.state };
            });
            break;

          case 'tool_call':
            updateSession(sessionId, (prev) => {
              const flushed = flushThinking(prev);
              const toolUseMsg: UIMessage = {
                type: 'tool_use',
                id: `tool_use-${msg.toolCallId}`,
                toolCallId: msg.toolCallId,
                toolName: msg.toolName,
                input: msg.input,
                createdAt: new Date().toISOString(),
              };
              return {
                ...flushed,
                chatState: 'thinking',
                messages: [...flushed.messages, toolUseMsg],
                toolCalls: [
                  ...flushed.toolCalls,
                  {
                    id: msg.toolCallId,
                    toolName: msg.toolName,
                    input: msg.input,
                    status: 'running',
                  },
                ],
              };
            });
            break;

          case 'tool_result':
            updateSession(sessionId, (prev) => {
              const flushed = flushThinking(prev);
              const toolUse = flushed.toolCalls.find((tc) => tc.id === msg.toolCallId)
              const toolResultMsg: UIMessage = {
                type: 'tool_result',
                id: `tool_result-${msg.toolCallId}`,
                toolCallId: msg.toolCallId,
                toolName: toolUse?.toolName || 'unknown',
                result: msg.result,
                isError: msg.isError,
                createdAt: new Date().toISOString(),
              };
              return {
                ...flushed,
                messages: [...flushed.messages, toolResultMsg],
                toolCalls: flushed.toolCalls.map((tc) =>
                  tc.id === msg.toolCallId
                    ? { ...tc, result: msg.result, isError: msg.isError, status: msg.isError ? 'error' : 'completed' }
                    : tc,
                ),
              };
            });
            break;

          case 'ask_question':
            updateSession(sessionId, (prev) => ({
              ...prev,
              pendingQuestion: {
                requestId: msg.requestId,
                questions: msg.questions as QuestionItem[],
              },
            }));
            break;

          case 'plan_proposal':
            updateSession(sessionId, (prev) => ({
              ...prev,
              pendingPlan: {
                requestId: msg.requestId,
                plan: msg.plan,
                isEnterMode: msg.plan === '__ENTER_PLAN_MODE__',
              },
            }));
            break;

          case 'usage':
            updateSession(sessionId, (prev) => ({
              ...prev,
              usage: {
                inputTokens: msg.inputTokens,
                outputTokens: msg.outputTokens,
                cacheReadTokens: msg.cacheReadTokens,
                cacheCreationTokens: msg.cacheCreationTokens,
              },
            }));
            break;
          case 'usage_total':
            updateSession(sessionId, (prev) => {
              const newUsage = {
                totalInput: prev.totalUsage.totalInput + msg.totalInput,
                totalOutput: prev.totalUsage.totalOutput + msg.totalOutput,
                totalCacheRead: prev.totalUsage.totalCacheRead + msg.totalCacheRead,
                totalCacheCreation: prev.totalUsage.totalCacheCreation + msg.totalCacheCreation,
              };
              console.log('[usage_total]', sessionId, msg, '→', newUsage);
              return { ...prev, totalUsage: newUsage };
            });
            break;

          case 'message_complete': {
            let completedText = '';
            updateSession(sessionId, (prev) => {
              const flushed = flushThinking(prev);
              if (!flushed.streamingText) {
                return {
                  ...flushed,
                  chatState: 'idle',
                  pendingQuestion: null,
                  pendingPlan: null,
                };
              }
              completedText = flushed.streamingText;
              const assistantMsg: UIMessage = {
                type: 'assistant_text',
                id: `assistant-${Date.now()}`,
                content: flushed.streamingText,
                createdAt: new Date().toISOString(),
              };
              return {
                ...flushed,
                messages: [...flushed.messages, assistantMsg],
                streamingText: '',
                chatState: 'idle',
                pendingQuestion: null,
                pendingPlan: null,
              };
            });

            // Send system notification if enabled and window not focused
            void maybeNotifyCompletion(notifyOnCompletion, sessionId, completedText);
            // Execute next queued query
            setTimeout(() => executeNextQueued(sessionId), 500);
            break;
          }

          case 'error': {
            const errorMsg: UIMessage = {
              type: 'error',
              id: `error-${Date.now()}`,
              message: msg.message,
              createdAt: new Date().toISOString(),
            };
            updateSession(sessionId, (prev) => ({
              ...prev,
              messages: [...prev.messages, errorMsg],
              chatState: 'idle',
              streamingText: '',
              thinkingText: '',
            }));
            break;
          }

          case 'connected':
          case 'pong':
            break;
        }
      });
    },
    [updateSession, loadHistory, notifyOnCompletion],
  );

  const disconnectSession = useCallback((sessionId: string) => {
    // Don't clear handlers here — StrictMode remount needs them.
    // Handlers are cleared at the start of connectToSession before re-registering.
    wsManager.disconnectDelayed(sessionId);
    // Server sidecar will detect WS disconnect and clean up the CLI sidecar for this session
  }, []);

  const sendMessage = useCallback(
    (sessionId: string, content: string, skipQueue?: boolean) => {
      let shouldSendViaWs = false;
      updateSession(sessionId, (prev) => {
        const isBusy = prev.chatState !== 'idle';

        // If busy and not explicitly skipping queue, add to queue
        if (isBusy && !skipQueue) {
          const query: QueuedQuery = {
            id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            content,
            createdAt: new Date().toISOString(),
          };
          return {
            ...prev,
            queuedQueries: [...prev.queuedQueries, query],
          };
        }

        // Not busy — send directly
        shouldSendViaWs = true;
        const userMsg: UIMessage = {
          type: 'user_text',
          id: `user-${Date.now()}`,
          content,
          createdAt: new Date().toISOString(),
        };
        return {
          ...prev,
          messages: [...prev.messages, userMsg],
          chatState: 'thinking',
          streamingText: '',
          thinkingText: '',
          hasActiveThinking: false,
          toolCalls: [],
          pendingQuestion: null,
          pendingPlan: null,
        };
      });

      if (shouldSendViaWs) {
        wsManager.send(sessionId, { type: 'user_message', content });
        // 首条消息标题同步由服务端 auto-title + 侧边栏 fetchSessions 完成，
        // 此处不额外处理（React hooks 不能在 event callback 中调用）。
      }
    },
    [updateSession, getSession],
  );

  const stopGeneration = useCallback(
    (sessionId: string) => {
      wsManager.send(sessionId, { type: 'stop_generation' });
      updateSession(sessionId, (prev) => ({ ...prev, chatState: 'idle' }));
    },
    [updateSession],
  );

  const clearMessages = useCallback(
    async (sessionId: string) => {
      try {
        await sessionsApi.clearMessages(sessionId);
      } catch {
        // Ignore server errors, still clear locally
      }
      // Also clear persisted tasks
      tasksApi.reset(sessionId).catch(() => {});
      updateSession(sessionId, () => createInitialSessionState());
    },
    [updateSession],
  );

  // Execute next queued query when session becomes idle
  const executeNextQueued = useCallback((sessionId: string) => {
    updateSession(sessionId, (prev) => {
      if (prev.chatState !== 'idle' || prev.queuedQueries.length === 0) return prev;
      const [next, ...rest] = prev.queuedQueries;
      if (!next) return prev;
      // Send the queued query message directly via WS
      const userMsg: UIMessage = {
        type: 'user_text',
        id: `user-${Date.now()}`,
        content: next.content,
        createdAt: new Date().toISOString(),
      };
      wsManager.send(sessionId, { type: 'user_message', content: next.content });
      return {
        ...prev,
        messages: [...prev.messages, userMsg],
        chatState: 'thinking',
        streamingText: '',
        thinkingText: '',
        hasActiveThinking: false,
        toolCalls: [],
        queuedQueries: rest,
        pendingQuestion: null,
        pendingPlan: null,
      };
    });
  }, [updateSession]);

  // Queue actions
  const addQueuedQuery = useCallback((sessionId: string, content: string) => {
    const query: QueuedQuery = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content,
      createdAt: new Date().toISOString(),
    };
    updateSession(sessionId, (prev) => ({
      ...prev,
      queuedQueries: [...prev.queuedQueries, query],
    }));
  }, [updateSession]);

  const removeQueuedQuery = useCallback((sessionId: string, queryId: string) => {
    updateSession(sessionId, (prev) => ({
      ...prev,
      queuedQueries: prev.queuedQueries.filter((q) => q.id !== queryId),
    }));
  }, [updateSession]);

  const reorderQueuedQueries = useCallback((sessionId: string, queries: QueuedQuery[]) => {
    updateSession(sessionId, (prev) => ({
      ...prev,
      queuedQueries: queries,
    }));
  }, [updateSession]);

  const executeQueryNow = useCallback((sessionId: string, queryId: string) => {
    updateSession(sessionId, (prev) => {
      const idx = prev.queuedQueries.findIndex((q) => q.id === queryId);
      if (idx === -1) return prev;
      const [query] = prev.queuedQueries.splice(idx, 1);
      if (!query) return prev;
      const userMsg: UIMessage = {
        type: 'user_text',
        id: `user-${Date.now()}`,
        content: query.content,
        createdAt: new Date().toISOString(),
      };
      wsManager.send(sessionId, { type: 'user_message', content: query.content });
      return {
        ...prev,
        messages: [...prev.messages, userMsg],
        chatState: 'thinking',
        streamingText: '',
        thinkingText: '',
        hasActiveThinking: false,
        toolCalls: [],
        pendingQuestion: null,
        pendingPlan: null,
      };
    });
  }, [updateSession]);

  const answerQuestion = useCallback(
    (sessionId: string, answer: string) => {
      wsManager.send(sessionId, { type: 'question_answer', answer });
      updateSession(sessionId, (prev) => ({ ...prev, pendingQuestion: null, chatState: 'thinking' }));
    },
    [],
  );

  const respondPlan = useCallback(
    (sessionId: string, response: string) => {
      wsManager.send(sessionId, { type: 'plan_response', response });
      updateSession(sessionId, (prev) => ({ ...prev, pendingPlan: null, chatState: 'thinking' }));
    },
    [],
  );

  return (
    <ChatContext.Provider
      value={{
        sessions,
        connectToSession,
        disconnectSession,
        sendMessage,
        stopGeneration,
        clearMessages,
        answerQuestion,
        respondPlan,
        getSession,
        loadHistory,
        addQueuedQuery,
        removeQueuedQuery,
        reorderQueuedQueries,
        executeQueryNow,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChatStore(): ChatStoreState {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatStore must be used within ChatProvider');
  return ctx;
}
