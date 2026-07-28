/**
 * HomePage — 首页
 *
 * 显示主要功能入口 + 最近会话列表
 */
import { useState, useEffect, useCallback } from 'react';
import { useTranslation, localeTag } from '../i18n';
import { useUIStore } from '../stores/uiStore';
import { sessionsApi } from '../api/sessions';
import { refreshServerPort, getServerBaseUrl } from '../api/serverPort';
import type { SessionListItem } from '../types/session';

type ServerStatus = 'checking' | 'connected' | 'disconnected';

/** 格式化相对时间 */
function formatRelativeTime(isoTime: string, t: (k: string, vars?: Record<string, string | number>) => string): string {
  const diff = Date.now() - new Date(isoTime).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return t('session.timeJustNow')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t('session.timeMinutes', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('session.timeHours', { n: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return t('session.timeDays', { n: days })
  return new Date(isoTime).toLocaleDateString(localeTag(), { month: 'short', day: 'numeric' })
}

export function HomePage() {
  const t = useTranslation();
  const [serverStatus, setServerStatus] = useState<ServerStatus>('checking');
  const [allSessions, setAllSessions] = useState<SessionListItem[]>([]);
  const [recentSessions, setRecentSessions] = useState<SessionListItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const { openTab } = useUIStore();

  // Check server health
  useEffect(() => {
    let cancelled = false;
    const checkServer = async () => {
      if (cancelled) return;
      try {
        const baseUrl = await getServerBaseUrl();
        const res = await fetch(`${baseUrl}/api/health`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json();
        if (!cancelled) setServerStatus('connected');
      } catch {
        if (!cancelled) {
          setServerStatus('disconnected');
          // Refresh port in case the server moved to a fallback port
          await refreshServerPort();
          setTimeout(checkServer, 2000);
        }
      }
    };
    void checkServer();
    return () => { cancelled = true; };
  }, []);

  // Close splash screen after mount (with logging)
  // NOTE: Splash is now closed by the Rust readiness check thread when the
  // server is confirmed ready. No frontend action needed.

  // Load all sessions + compute stats + recent list
  const loadRecent = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const data = await sessionsApi.list();
      setAllSessions(data.sessions);
      // Sort by modifiedAt descending, take top 10
      const sorted = [...data.sessions]
        .sort((a, b) => new Date(b.modifiedAt || b.createdAt).getTime() - new Date(a.modifiedAt || a.createdAt).getTime())
        .slice(0, 10);
      setRecentSessions(sorted);
    } catch {
      // ignore
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  // Compute stats
  const totalSessions = allSessions.length;
  const totalMessages = allSessions.reduce((sum, s) => sum + (s.messageCount || 0), 0);
  const todayStr = new Date().toLocaleDateString(localeTag());
  const todaySessions = allSessions.filter((s) => {
    const d = s.modifiedAt || s.createdAt;
    return d && new Date(d).toLocaleDateString(localeTag()) === todayStr;
  }).length;

  const handleNewSession = useCallback(() => {
    const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    openTab(id, t('session.newTitle'), 'session');
  }, [openTab, t]);

  const handleOpenSession = useCallback((session: SessionListItem) => {
    openTab(session.id, session.title || t('session.title'), 'session');
  }, [openTab, t]);

  const statusDot: Record<ServerStatus, string> = {
    checking: 'bg-[var(--color-warning)]',
    connected: 'bg-[var(--color-success)]',
    disconnected: 'bg-[var(--color-error)]',
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--color-surface)]">
      <div className="mx-auto max-w-3xl px-8 py-10">
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1
              className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]"
              style={{ fontFamily: 'var(--font-headline)' }}
            >
              {t('home.welcome')}
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              {t('home.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
            <span className={`inline-block w-2 h-2 rounded-full ${statusDot[serverStatus]}`} />
            {serverStatus === 'connected' ? t('home.connected') : serverStatus === 'disconnected' ? t('home.disconnected') : t('home.checking')}
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-3 mb-10">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-4 py-3.5">
            <div className="text-lg font-bold text-[var(--color-text-primary)]">{totalSessions}</div>
            <div className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{t('home.totalSessions')}</div>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-4 py-3.5">
            <div className="text-lg font-bold text-[var(--color-text-primary)]">{todaySessions}</div>
            <div className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{t('home.todaySessions')}</div>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-4 py-3.5">
            <div className="text-lg font-bold text-[var(--color-text-primary)]">{totalMessages}</div>
            <div className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{t('home.totalMessages')}</div>
          </div>
        </div>

        {/* ── Quick Actions ── */}
        <div className="mb-10">
          <h2 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">
            {t('home.quickActions')}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleNewSession}
              className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-5 text-left hover:border-[var(--color-brand)]/40 hover:bg-[var(--color-surface-container)] transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-[var(--color-brand)]/10 flex items-center justify-center mb-3 group-hover:bg-[var(--color-brand)]/15 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-brand)]">
                  <path d="M12 5v14" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <div className="text-sm font-medium text-[var(--color-text-primary)]">{t('home.newChat')}</div>
              <div className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{t('home.newChatDesc')}</div>
            </button>

            <button
              onClick={() => openTab('settings', t('sidebar.settings'), 'settings')}
              className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-5 text-left hover:border-[var(--color-brand)]/40 hover:bg-[var(--color-surface-container)] transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-[var(--color-text-tertiary)]/10 flex items-center justify-center mb-3 group-hover:bg-[var(--color-text-tertiary)]/15 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-secondary)]">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </div>
              <div className="text-sm font-medium text-[var(--color-text-primary)]">{t('home.openSettings')}</div>
              <div className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{t('home.openSettingsDesc')}</div>
            </button>
          </div>
        </div>

        {/* ── Recent Sessions ── */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
              {t('home.recentSessions')}
            </h2>
            <button
              onClick={loadRecent}
              className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
              title={t('fileExplorer.refresh')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loadingSessions ? 'animate-spin' : ''}>
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
          </div>

          {recentSessions.length === 0 && !loadingSessions && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] py-10 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--color-surface-container)] mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-tertiary)]">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="text-sm text-[var(--color-text-tertiary)]">{t('home.noSessions')}</p>
              <button
                onClick={handleNewSession}
                className="mt-3 text-xs text-[var(--color-brand)] hover:text-[var(--color-brand)]/80 hover:underline transition-colors"
              >
                {t('home.startNewChat')}
              </button>
            </div>
          )}

          {loadingSessions && recentSessions.length === 0 && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] py-10 text-center">
              <div className="inline-flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 text-[var(--color-text-tertiary)]" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">{t('home.loading')}</p>
            </div>
          )}

          {recentSessions.length > 0 && (
            <div className="rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)] overflow-hidden">
              {recentSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => handleOpenSession(session)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-surface-hover)] transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-[var(--color-surface-container)] flex items-center justify-center shrink-0 group-hover:bg-[var(--color-surface-container-high)] transition-colors">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-tertiary)]">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                      {session.title || t('session.title')}
                    </div>
                    <div className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
                      {session.messageCount > 0 && `${t('session.messageCount', { n: session.messageCount })} · `}
                      {formatRelativeTime(session.modifiedAt || session.createdAt, t)}
                    </div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex flex-col items-center gap-4">
          <p className="text-[10px] text-[var(--color-text-tertiary)]/60">
            {t('app.name')}
            <span className="ml-1">v{__APP_VERSION__}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
