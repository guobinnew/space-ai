import { useEffect } from 'react';
import { useUIStore, HOME_TAB_ID, SETTINGS_TAB_ID } from '../../stores/uiStore';
import { useSessionStore } from '../../stores/sessionStore';

export function Sidebar() {
  const { sidebarOpen, toggleSidebar, activeTabId, openTab } = useUIStore();
  const { sessions, fetchSessions, createSession, isLoading } = useSessionStore();

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  const handleNewSession = async () => {
    try {
      const sessionId = await createSession();
      openTab(sessionId, '新会话', 'session');
    } catch (err) {
      console.error('Failed to create session:', err);
    }
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
            <div
              className="h-8 w-8 rounded-lg flex-shrink-0 flex items-center justify-center text-white font-bold text-sm"
              style={{ background: 'var(--gradient-btn-primary)' }}
            >
              S
            </div>
            <span
              className={`sidebar-copy ${sidebarOpen ? 'sidebar-copy--visible' : 'sidebar-copy--hidden'} text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]`}
              style={{ fontFamily: 'var(--font-headline)' }}
            >
              Smart Space
            </span>
          </div>
          <button
            type="button"
            onClick={toggleSidebar}
            className="flex items-center justify-center h-8 w-8 rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]"
            aria-label={sidebarOpen ? '折叠侧边栏' : '展开侧边栏'}
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
          label="首页"
          onClick={() => openTab(HOME_TAB_ID, '首页', 'home', false)}
          icon={<HomeIcon />}
        >
          首页
        </NavItem>
        <NavItem
          active={false}
          collapsed={!sidebarOpen}
          label="新会话"
          onClick={handleNewSession}
          icon={<PlusIcon />}
        >
          新会话
        </NavItem>
      </div>

      {/* Session list */}
      {sidebarOpen && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-4 pb-1 pt-2 text-[11px] font-semibold tracking-wide text-[var(--color-text-tertiary)]">
            会话
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2">
            {isLoading && sessions.length === 0 && (
              <div className="px-2 py-4 text-center text-xs text-[var(--color-text-tertiary)]">
                加载中...
              </div>
            )}
            {!isLoading && sessions.length === 0 && (
              <div className="px-2 py-4 text-center text-xs text-[var(--color-text-tertiary)]">
                暂无会话
              </div>
            )}
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => openTab(session.id, session.title, 'session')}
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
            ))}
          </div>
        </div>
      )}

      {!sidebarOpen && <div className="flex-1" aria-hidden="true" />}

      {/* Footer: settings */}
      <div className={`border-t border-[var(--color-border)] p-3 ${sidebarOpen ? '' : 'flex justify-center'}`}>
        <NavItem
          active={activeTabId === SETTINGS_TAB_ID}
          collapsed={!sidebarOpen}
          label="设置"
          onClick={() => openTab(SETTINGS_TAB_ID, '设置', 'settings')}
          icon={<SettingsIcon />}
        >
          设置
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

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
