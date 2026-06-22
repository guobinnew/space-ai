/**
 * Chat Store — 聊天流式状态管理
 *
 * 参照 smart-code chatStore.ts 复刻，简化版。
 * 每个会话维护独立的消息列表、流式状态和 sidecar 进程。
 * 打开会话时启动对应的 sidecar 进程，通过 WebSocket 通信。
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { wsManager, type ServerMessage } from '../api/websocket';
import type { UIMessage, PerSessionChatState } from '../types/chat';

interface ChatStoreState {
  sessions: Record<string, PerSessionChatState>;
  /** Per-session sidecar port (0 = not started) */
  ports: Record<string, number>;
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
  const [ports, setPorts] = useState<Record<string, number>>({});

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
    async (sessionId: string, port: number) => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/sessions/${encodeURIComponent(sessionId)}/messages`);
        if (!res.ok) return;
        const data = await res.json() as { messages: Array<{ id: string; role: string; content: string; createdAt: string }> };
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
      // If already connected, skip
      if (ports[sessionId]) {
        wsManager.connect(sessionId, ports[sessionId]);
        return;
      }

      // Start per-session sidecar (Tauri only)
      let port = 3721;
      try {
        port = await invoke<number>('start_session_sidecar', { sessionId });
      } catch {
        // Not in Tauri (browser dev) — use default port
      }

      setPorts((prev) => ({ ...prev, [sessionId]: port }));

      // Connect WebSocket to the session's sidecar port
      wsManager.connect(sessionId, port);

      // Load history
      void loadHistory(sessionId, port);

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
            break;
        }
      });
    },
    [updateSession, loadHistory, ports],
  );

  const disconnectSession = useCallback(
    (sessionId: string) => {
      wsManager.clearHandlers(sessionId);
      wsManager.disconnect(sessionId);

      // Stop the sidecar process for this session (Tauri only)
      invoke('stop_session_sidecar', { sessionId }).catch(() => {
        // Not in Tauri or already stopped
      });

      setPorts((prev) => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
    },
    [],
  );

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

  return (
    <ChatContext.Provider
      value={{
        sessions,
        ports,
        connectToSession,
        disconnectSession,
        sendMessage,
        stopGeneration,
        getSession,
        loadHistory: (id: string) => loadHistory(id, ports[id] || 3721),
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
