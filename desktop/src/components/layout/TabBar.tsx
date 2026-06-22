import { useUIStore } from '../../stores/uiStore';
import { WindowControls, showWindowControls } from './WindowControls';
import type { Tab } from '../../stores/uiStore';

const isTauri =
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useUIStore();

  if (tabs.length === 0 && !showWindowControls) return null;

  return (
    <div
      data-testid="tab-bar"
      className="flex items-stretch bg-[var(--color-surface-container)] min-h-[37px] select-none border-b border-[var(--color-border)]"
    >
      <div
        className="flex-1 flex items-stretch overflow-x-auto"
        data-tauri-drag-region
      >
        {tabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onClick={() => setActiveTab(tab.id)}
            onClose={() => closeTab(tab.id)}
          />
        ))}
      </div>

      {isTauri && (
        <div
          data-tauri-drag-region
          aria-hidden="true"
          className={`flex-shrink-0 min-h-[37px] ${showWindowControls ? 'w-3' : 'w-4'}`}
        />
      )}

      <WindowControls />
    </div>
  );
}

function TabItem({
  tab,
  isActive,
  onClick,
  onClose,
}: {
  tab: Tab;
  isActive: boolean;
  onClick: () => void;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`
        tab-bar-hit-area flex-shrink-0 flex items-center gap-1.5 px-3 min-h-[37px] relative group cursor-default
        transition-[background-color] duration-150 ease-out
        ${isActive
          ? 'bg-[var(--color-surface)]'
          : 'bg-transparent hover:bg-[var(--color-surface-hover)]'
        }
      `}
      style={{ width: 180, maxWidth: 180 }}
    >
      {tab.type === 'home' && <HomeGlyph />}
      {tab.type === 'settings' && <SettingsGlyph />}
      {tab.type === 'session' && <ChatGlyph />}

      <span
        className={`flex-1 truncate text-xs ${isActive ? 'text-[var(--color-text-primary)] font-medium' : 'text-[var(--color-text-secondary)]'}`}
      >
        {tab.title}
      </span>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className={`flex-shrink-0 w-4 h-4 flex items-center justify-center rounded transition-opacity text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] ${tab.closable ? 'opacity-0 group-hover:opacity-100' : 'hidden'}`}
        aria-label="关闭标签"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

function HomeGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-[var(--color-text-tertiary)]">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function SettingsGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-[var(--color-text-tertiary)]">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function ChatGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-[var(--color-text-tertiary)]">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
