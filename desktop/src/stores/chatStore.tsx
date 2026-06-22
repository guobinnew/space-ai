/**
 * Chat Store — 聊天流式状态管理
 *
 * 参照 smart-code chatStore.ts 复刻，简化版。
 * 每个会话维护独立的消息列表和流式状态。
 * 通过 WebSocket 与后端通信，接收流式 LLM 响应。
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { wsManager, type ServerMessage } from '../api/websocket';
import { sessionsApi } from '../api/sessions';
import type { UIMessage, PerSessionChatState } from '../types/chat';

interface ChatStoreState {
  sessions: Record<string, PerSessionChatState>;
  connectToSession: (sessionId: string) => void;
  disconnectSession: (sessionId: string) => void;
  sendMessage: (sessionId: string, content: string) => void;
  stopGeneration: (sessionId: string) => void;
  getSession: (sessionId: string) => PerSessionChatState;
  loadHistory: (sessionId: string) => Promise<void>;
}

const ChatContext = createContext<ChatStoreState | null>(null);

function createInitialSessionState(): PerSessionChatState {
  return {
    messages: [],
    chatState: 'idle',
    streamingText: '',
  };
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Record<string, PerSessionChatState>>({});

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
    async (sessionId: string) => {
      // Ensure sidecar is running before connecting (Tauri only)
      try {
        await invoke('start_sidecar');
      } catch {
        // Not in Tauri (browser dev) or already running — ignore
      }

      wsManager.connect(sessionId);

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
            }));
            break;

          case 'content_delta':
            updateSession(sessionId, (prev) => ({
              ...prev,
              streamingText: prev.streamingText + msg.text,
            }));
            break;

          case 'status':
            updateSession(sessionId, (prev) => ({
              ...prev,
              chatState: msg.state,
            }));
            break;

          case 'message_complete': {
            // Finalize: move streamingText to messages
            updateSession(sessionId, (prev) => {
              if (!prev.streamingText) return { ...prev, chatState: 'idle' };
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
                chatState: 'idle',
              };
            });
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
            }));
            break;
          }

          case 'connected':
          case 'pong':
            // No state change needed
            break;
        }
      });
    },
    [updateSession, loadHistory],
  );

  const disconnectSession = useCallback((sessionId: string) => {
    wsManager.clearHandlers(sessionId);
    wsManager.disconnect(sessionId);
  }, []);

  const sendMessage = useCallback(
    (sessionId: string, content: string) => {
      // Add user message immediately (optimistic)
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
      }));

      // Send via WebSocket
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

  return (
    <ChatContext.Provider
      value={{
        sessions,
        connectToSession,
        disconnectSession,
        sendMessage,
        stopGeneration,
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
