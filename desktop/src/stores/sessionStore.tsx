/**
 * Session Store — 会话状态管理
 *
 * 参照 smart-code sessionStore.ts 复刻，简化版。
 * 使用 React Context 实现。
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { sessionsApi } from '../api/sessions';
import type { SessionListItem, ChatMessage } from '../types/session';

interface SessionState {
  sessions: SessionListItem[];
  isLoading: boolean;
  error: string | null;
  // Per-session message cache
  messages: Record<string, ChatMessage[]>;
  fetchSessions: () => Promise<void>;
  createSession: (workDir?: string) => Promise<string>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  updateWorkDir: (id: string, workDir: string) => Promise<void>;
  loadMessages: (id: string) => Promise<void>;
  sendMessage: (id: string, content: string) => Promise<void>;
  clearError: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});

  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await sessionsApi.list();
      setSessions(data.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载会话列表失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createSession = useCallback(async (workDir?: string) => {
    const session = await sessionsApi.create({ workDir });
    setSessions((prev) => [
      {
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        modifiedAt: session.modifiedAt,
        messageCount: session.messageCount,
        workDir: session.workDir,
      },
      ...prev,
    ]);
    setMessages((prev) => ({ ...prev, [session.id]: [] }));
    return session.id;
  }, []);

  const deleteSession = useCallback(async (id: string) => {
    await sessionsApi.delete(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setMessages((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const renameSession = useCallback(async (id: string, title: string) => {
    await sessionsApi.rename(id, title);
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
  }, []);

  const updateWorkDir = useCallback(async (id: string, workDir: string) => {
    await sessionsApi.updateWorkDir(id, workDir);
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, workDir } : s)));
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    try {
      const data = await sessionsApi.getMessages(id);
      setMessages((prev) => ({ ...prev, [id]: data.messages }));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载消息失败');
    }
  }, []);

  const sendMessage = useCallback(async (id: string, content: string) => {
    // Optimistic: add user message immediately
    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => ({
      ...prev,
      [id]: [...(prev[id] || []), userMsg],
    }));

    try {
      // Save user message to server
      await sessionsApi.addMessage(id, 'user', content);

      // Add a placeholder assistant response
      const assistantMsg: ChatMessage = {
        id: `temp-assistant-${Date.now()}`,
        role: 'assistant',
        content: '收到消息。会话功能开发中，暂不支持 AI 回复。',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => ({
        ...prev,
        [id]: [...(prev[id] || []), assistantMsg],
      }));
      await sessionsApi.addMessage(id, 'assistant', assistantMsg.content);

      // Update session list item (title may have been auto-updated by server)
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          // Auto-title from first user message (only if user hasn't manually renamed)
          const newTitle = s.messageCount === 0 && s.title === '新会话' && content.trim()
            ? content.slice(0, 30) + (content.length > 30 ? '...' : '')
            : s.title;
          return {
            ...s,
            title: newTitle,
            messageCount: s.messageCount + 2,
            modifiedAt: new Date().toISOString(),
          };
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送消息失败');
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <SessionContext.Provider
      value={{
        sessions,
        setSessions,
        isLoading,
        error,
        messages,
        fetchSessions,
        createSession,
        deleteSession,
        renameSession,
        updateWorkDir,
        loadMessages,
        sendMessage,
        clearError,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionStore(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSessionStore must be used within SessionProvider');
  return ctx;
}
