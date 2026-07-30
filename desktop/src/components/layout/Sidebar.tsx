import { useEffect, useState, useCallback, useMemo } from 'react';
import { useUIStore, HOME_TAB_ID, SETTINGS_TAB_ID, STATS_TAB_ID, AUTOMATION_TAB_ID } from '../../stores/uiStore';
import { useSessionStore } from '../../stores/sessionStore';
import { useTranslation } from '../../i18n';
import type { SessionListItem } from '../../types/session';

type ContextMenu = { sessionId: string; x: number; y: number; session: SessionListItem };

export function Sidebar() {
  const t = useTranslation();
  const { sidebarOpen, toggleSidebar, activeTabId, openTab, closeTab, updateTabTitle, defaultWorkDir } = useUIStore();
  const { sessions, fetchSessions, createSession, deleteSession, renameSession, isLoading } = useSessionStore();
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    void fetchSessions();
    // 定时轮询会话列表，确保定时任务新建的会话能同步显示
    const timer = setInterval(() => void fetchSessions(), 15000);
    return () => clearInterval(timer);
  }, [fetchSessions]);

  const handleNewSession = async () => {
    try {
      const sessionId = await createSession(defaultWorkDir || undefined);
      openTab(sessionId, t('sidebar.newSession'), 'session');
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent, session: SessionListItem) => {
    e.preventDefault();
    setContextMenu({ sessionId: session.id, x: e.clientX, y: e.clientY, session });
  }, []);

  // 按时间分组会话
  const groupedSessions = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const sevenDaysAgo = new Date(todayStart.getTime() - 7 * 86400000);
    const thirtyDaysAgo = new Date(todayStart.getTime() - 30 * 86400000);

    const groups: { key: string; label: string; sessions: SessionListItem[] }[] = [
      { key: 'today', label: t('sidebar.groupToday'), sessions: [] },
      { key: 'yesterday', label: t('sidebar.groupYesterday'), sessions: [] },
      { key: 'week', label: t('sidebar.groupWeek'), sessions: [] },
      { key: 'month', label: t('sidebar.groupMonth'), sessions: [] },
      { key: 'earlier', label: t('sidebar.groupEarlier'), sessions: [] },
    ];

    for (const session of sessions) {
      const date = new Date(session.modifiedAt);
      if (date >= todayStart) groups[0]!.sessions.push(session);
      else if (date >= yesterdayStart) groups[1]!.sessions.push(session);
      else if (date >= sevenDaysAgo) groups[2]!.sessions.push(session);
      else if (date >= thirtyDaysAgo) groups[3]!.sessions.push(session);
      else groups[4]!.sessions.push(session);
    }

    return groups.filter((g) => g.sessions.length > 0);
  }, [sessions, t]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextMenu]);

  const handleStartRename = (sessionId: string, currentTitle: string) => {
    setContextMenu(null);
    setRenamingId(sessionId);
    setRenameValue(currentTitle);
  };

  const handleFinishRename = async () => {
    if (renamingId && renameValue.trim()) {
      await renameSession(renamingId, renameValue.trim());
      updateTabTitle(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  };

  const handleDelete = async (sessionId: string) => {
    setContextMenu(null);
    closeTab(sessionId);
    await deleteSession(sessionId);
  };

  return (
    <aside
      className="sidebar-panel relative h-full flex flex-col bg-[var(--color-surface-sidebar)] border-r border-[var(--color-border)] select-none"
      data-state={sidebarOpen ? 'open' : 'closed'}
      aria-label="Sidebar"
    >
      {/* Brand + collapse toggle */}
      <div className="px-3 pt-3 pb-2" data-tauri-drag-region>
        <div className={`flex ${sidebarOpen ? 'items-center justify-between gap-3' : 'flex-col items-center gap-2'}`}>
          <div className={`flex min-w-0 items-center ${sidebarOpen ? 'gap-2.5' : 'justify-center'}`}>
            <img
              src="/icon.png"
              alt={t('app.name')}
              className="h-8 w-8 rounded-lg flex-shrink-0"
            />
            <span
              className={`sidebar-copy ${sidebarOpen ? 'sidebar-copy--visible' : 'sidebar-copy--hidden'} text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]`}
              style={{ fontFamily: 'var(--font-headline)' }}
            >
              {t('app.name')}
              <span className="ml-1.5 text-[10px] font-normal text-[var(--color-text-tertiary)]">v{__APP_VERSION__}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={toggleSidebar}
            className="flex items-center justify-center h-8 w-8 rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]"
            aria-label={sidebarOpen ? t('sidebar.collapse') : t('sidebar.expand')}
          >
            <SidebarToggleIcon collapsed={!sidebarOpen} />
          </button>
        </div>
      </div>

      {/* Primary navigation */}
      <div className={`px-3 pb-3 flex flex-col ${sidebarOpen ? 'gap-0.5' : 'items-center gap-2'}`}>
        <NavItem
          active={activeTabId === HOME_TAB_ID}
          collapsed={!sidebarOpen}
          label={t('sidebar.home')}
          onClick={() => openTab(HOME_TAB_ID, t('sidebar.home'), 'home', false)}
          icon={<HomeIcon />}
        >
          {t('sidebar.home')}
        </NavItem>
        <NavItem
          active={false}
          collapsed={!sidebarOpen}
          label={t('sidebar.newSession')}
          onClick={handleNewSession}
          icon={<PlusIcon />}
        >
          {t('sidebar.newSession')}
        </NavItem>
      </div>

      {/* Session list */}
      {sidebarOpen && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-4 pb-1 pt-2 text-[11px] font-semibold tracking-wide text-[var(--color-text-tertiary)]">
            {t('sidebar.sessions')}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2">
            {isLoading && sessions.length === 0 && (
              <div className="px-2 py-4 text-center text-xs text-[var(--color-text-tertiary)]">
                {t('sidebar.loading')}
              </div>
            )}
            {!isLoading && sessions.length === 0 && (
              <div className="px-2 py-4 text-center text-xs text-[var(--color-text-tertiary)]">
                {t('sidebar.noSessions')}
              </div>
            )}
            {groupedSessions.map((group) => (
              <div key={group.key} className="mb-1">
                <div className="px-3 pt-2 pb-0.5 text-[10px] font-medium text-[var(--color-text-tertiary)]/70">
                  {group.label}
                </div>
                {group.sessions.map((session) => (
              <div key={session.id} className="relative">
                {renamingId === session.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={handleFinishRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleFinishRename();
                      if (e.key === 'Escape') {
                        setRenamingId(null);
                        setRenameValue('');
                      }
                    }}
                    className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-focus)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] outline-none"
                  />
                ) : (
                  <button
                    onClick={() => openTab(session.id, session.title, 'session')}
                    onContextMenu={(e) => handleContextMenu(e, session)}
                    className={`group w-full rounded-[var(--radius-md)] py-1.5 pl-3 pr-2 text-left text-sm transition-colors ${
                      session.id === activeTabId
                        ? 'bg-[var(--color-surface-selected)] text-[var(--color-text-primary)]'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-1 w-1 flex-shrink-0 rounded-full"
                        style={{
                          backgroundColor: session.id === activeTabId ? 'var(--color-brand)' : 'var(--color-text-tertiary)',
                          opacity: session.id === activeTabId ? 1 : 0.5,
                        }}
                      />
                      <span className="flex-1 truncate">{session.title}</span>
                    </span>
                  </button>
                )}
              </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Context menu for session list */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[140px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1"
          style={{ left: contextMenu.x, top: contextMenu.y, boxShadow: 'var(--shadow-dropdown)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleStartRename(contextMenu.sessionId, contextMenu.session.title)}
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-hover)]"
          >
            {t('session.rename')}
          </button>
          <button
            onClick={() => handleDelete(contextMenu.sessionId)}
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-error)] transition-colors hover:bg-[var(--color-surface-hover)]"
          >
            {t('common.delete')}
          </button>
        </div>
      )}

      {!sidebarOpen && <div className="flex-1" aria-hidden="true" />}

      {/* Footer: stats + settings */}
      <div className={`border-t border-[var(--color-border)] p-3 flex flex-col gap-1 ${sidebarOpen ? '' : 'items-center'}`}>
        <NavItem
          active={activeTabId === STATS_TAB_ID}
          collapsed={!sidebarOpen}
          label={t('sidebar.stats')}
          onClick={() => openTab(STATS_TAB_ID, t('sidebar.stats'), 'stats')}
          icon={<ChartIcon />}
        >
          {t('sidebar.stats')}
        </NavItem>
        <NavItem
          active={activeTabId === AUTOMATION_TAB_ID}
          collapsed={!sidebarOpen}
          label={t('sidebar.automation')}
          onClick={() => openTab(AUTOMATION_TAB_ID, t('sidebar.automation'), 'automation')}
          icon={<ClockIcon />}
        >
          {t('sidebar.automation')}
        </NavItem>
        <NavItem
          active={activeTabId === SETTINGS_TAB_ID}
          collapsed={!sidebarOpen}
          label={t('sidebar.settings')}
          onClick={() => openTab(SETTINGS_TAB_ID, t('sidebar.settings'), 'settings')}
          icon={<SettingsIcon />}
        >
          {t('sidebar.settings')}
        </NavItem>
      </div>
    </aside>
  );
}

function NavItem({
  active,
  collapsed,
  label,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  collapsed: boolean;
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={collapsed ? label : undefined}
      className={`
        flex items-center rounded-[var(--radius-md)] transition-all duration-200
        ${collapsed ? 'h-10 w-10 justify-center px-0 py-0' : 'w-full gap-2.5 px-3 py-2 text-sm'}
        ${active
          ? 'bg-[var(--color-surface-selected)] font-medium text-[var(--color-text-primary)]'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]'
        }
      `}
    >
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
        {icon}
      </span>
      <span className={`sidebar-copy ${collapsed ? 'sidebar-copy--hidden' : 'sidebar-copy--visible'}`}>
        {children}
      </span>
    </button>
  );
}

function SidebarToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width={collapsed ? 16 : 14}
      height={collapsed ? 16 : 14}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={collapsed ? 'M5 3 9 7l-4 4' : 'M9 3 5 7l4 4'}
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
