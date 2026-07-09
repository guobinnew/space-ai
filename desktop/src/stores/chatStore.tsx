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
import { useUIStore } from './uiStore';
import type { UIMessage, PerSessionChatState, QuestionItem } from '../types/chat';

/** Server sidecar 固定端口 */
const SERVER_PORT = 3721;

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
      title: 'Smart Space',
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
  answerQuestion: (sessionId: string, answer: string) => void;
  respondPlan: (sessionId: string, response: string) => void;
  getSession: (sessionId: string) => PerSessionChatState;
  loadHistory: (sessionId: string) => Promise<void>;
}

const ChatContext = createContext<ChatStoreState | null>(null);

function createInitialSessionState(): PerSessionChatState {
  return {
    messages: [],
    chatState: 'idle',
    streamingText: '',
    thinkingText: '',
    toolCalls: [],
    pendingQuestion: null,
    pendingPlan: null,
    usage: null,
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
        const uiMessages: UIMessage[] = data.messages.map((m) =>
          m.role === 'user'
            ? { type: 'user_text', id: m.id, content: m.content, createdAt: m.createdAt }
            : { type: 'assistant_text', id: m.id, content: m.content, createdAt: m.createdAt },
        );
        updateSession(sessionId, (prev) => ({ ...prev, messages: uiMessages }));
      } catch {
        // Ignore load errors
      }
    },
    [updateSession],
  );

  const connectToSession = useCallback(
    (sessionId: string) => {
      // Connect to the single Server sidecar (fixed port).
      // The Server sidecar will spawn a CLI sidecar for this session internally.
      wsManager.connect(sessionId, SERVER_PORT);

      // Load history
      void loadHistory(sessionId);

      // Register message handler
      wsManager.onMessage(sessionId, (msg: ServerMessage) => {
        switch (msg.type) {
          case 'content_start':
            updateSession(sessionId, (prev) => ({
              ...prev,
              chatState: 'streaming',
              streamingText: '',
              // Don't clear thinkingText here — thinking_delta arrives
              // from extended thinking AFTER content_start but BEFORE text_delta.
              // Keeping it allows ThinkingBlock to display accumulated content.
            }));
            break;

          case 'content_delta':
            updateSession(sessionId, (prev) => ({
              ...prev,
              streamingText: prev.streamingText + msg.text,
            }));
            break;

          case 'thinking_delta':
            updateSession(sessionId, (prev) => ({
              ...prev,
              thinkingText: prev.thinkingText + msg.text,
            }));
            break;

          case 'status':
            updateSession(sessionId, (prev) => ({
              ...prev,
              chatState: msg.state,
            }));
            break;

          case 'tool_call':
            updateSession(sessionId, (prev) => ({
              ...prev,
              chatState: 'thinking',
              toolCalls: [
                ...prev.toolCalls,
                {
                  id: msg.toolCallId,
                  toolName: msg.toolName,
                  input: msg.input,
                  status: 'running',
                },
              ],
            }));
            break;

          case 'tool_result':
            updateSession(sessionId, (prev) => ({
              ...prev,
              toolCalls: prev.toolCalls.map((tc) =>
                tc.id === msg.toolCallId
                  ? {
                      ...tc,
                      result: msg.result,
                      isError: msg.isError,
                      status: msg.isError ? 'error' : 'completed',
                    }
                  : tc,
              ),
            }));
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
              usage: { inputTokens: msg.inputTokens, outputTokens: msg.outputTokens },
            }));
            break;

          case 'message_complete': {
            let completedText = '';
            updateSession(sessionId, (prev) => {
              if (!prev.streamingText) return { ...prev, chatState: 'idle', thinkingText: '' };
              completedText = prev.streamingText;
              const assistantMsg: UIMessage = {
                type: 'assistant_text',
                id: `assistant-${Date.now()}`,
                content: prev.streamingText,
                createdAt: new Date().toISOString(),
              };
              return {
                ...prev,
                messages: [...prev.messages, assistantMsg],
                streamingText: '',
                thinkingText: '',
                chatState: 'idle',
                pendingQuestion: null,
                pendingPlan: null,
              };
            });

            // Send system notification if enabled and window not focused
            void maybeNotifyCompletion(notifyOnCompletion, sessionId, completedText);
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
    wsManager.clearHandlers(sessionId);
    // Use delayed disconnect to avoid React StrictMode connect-disconnect-connect race
    wsManager.disconnectDelayed(sessionId);
    // Server sidecar will detect WS disconnect and clean up the CLI sidecar for this session
  }, []);

  const sendMessage = useCallback(
    (sessionId: string, content: string) => {
      const userMsg: UIMessage = {
        type: 'user_text',
        id: `user-${Date.now()}`,
        content,
        createdAt: new Date().toISOString(),
      };
      updateSession(sessionId, (prev) => ({
        ...prev,
        messages: [...prev.messages, userMsg],
        chatState: 'thinking',
        streamingText: '',
        thinkingText: '',
        toolCalls: [],
        pendingQuestion: null,
        pendingPlan: null,
      }));

      wsManager.send(sessionId, { type: 'user_message', content });
    },
    [updateSession],
  );

  const stopGeneration = useCallback(
    (sessionId: string) => {
      wsManager.send(sessionId, { type: 'stop_generation' });
      updateSession(sessionId, (prev) => ({ ...prev, chatState: 'idle' }));
    },
    [updateSession],
  );

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
        answerQuestion,
        respondPlan,
        getSession,
        loadHistory,
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
