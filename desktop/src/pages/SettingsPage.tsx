import { useState } from 'react';
import { useUIStore } from '../stores/uiStore';
import type { Theme } from '../stores/uiStore';

type SettingsCategory = 'general' | 'about';

export function SettingsPage() {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('general');

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--color-surface)]">
      <div className="flex-1 flex overflow-hidden">
        {/* Category navigation */}
        <div className="w-[180px] border-r border-[var(--color-border)] py-3 flex-shrink-0 flex flex-col">
          <div className="flex-1">
            <CategoryButton
              icon={<GeneralIcon />}
              label="通用"
              active={activeCategory === 'general'}
              onClick={() => setActiveCategory('general')}
            />
          </div>
          <div className="border-t border-[var(--color-border)] pt-1">
            <CategoryButton
              icon={<AboutIcon />}
              label="关于"
              active={activeCategory === 'about'}
              onClick={() => setActiveCategory('about')}
            />
          </div>
        </div>

        {/* Category content */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {activeCategory === 'general' && <GeneralSettings />}
          {activeCategory === 'about' && <AboutSettings />}
        </div>
      </div>
    </div>
  );
}

function CategoryButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors ${
        active
          ? 'bg-[var(--color-surface-selected)] text-[var(--color-text-primary)] font-medium'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
      }`}
    >
      <span className="flex h-[18px] w-[18px] items-center justify-center flex-shrink-0">
        {icon}
      </span>
      {label}
    </button>
  );
}

function GeneralSettings() {
  const { theme, setTheme } = useUIStore();

  const themes: Array<{ value: Theme; label: string }> = [
    { value: 'light', label: '浅色' },
    { value: 'dark', label: '深色' },
  ];

  return (
    <div className="max-w-xl">
      {/* Appearance selector */}
      <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">外观</h2>
      <p className="text-sm text-[var(--color-text-tertiary)] mb-3">切换应用的明暗主题</p>
      <div className="flex gap-2">
        {themes.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setTheme(value)}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${
              theme === value
                ? 'text-[var(--color-btn-primary-fg)] border-transparent shadow-[var(--shadow-button-primary)]'
                : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
            }`}
            style={
              theme === value
                ? { background: 'var(--gradient-btn-primary)' }
                : undefined
            }
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AboutSettings() {
  return (
    <div className="max-w-xl">
      <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">关于</h2>
      <p className="text-sm text-[var(--color-text-tertiary)] mb-6">应用信息</p>

      <div className="flex items-center gap-4 mb-6">
        <div
          className="h-16 w-16 rounded-2xl flex-shrink-0 flex items-center justify-center text-white text-2xl font-bold"
          style={{ background: 'var(--gradient-btn-primary)', boxShadow: 'var(--shadow-dropdown)' }}
        >
          S
        </div>
        <div>
          <div
            className="text-lg font-bold text-[var(--color-text-primary)]"
            style={{ fontFamily: 'var(--font-headline)' }}
          >
            Smart Space
          </div>
          <div className="text-sm text-[var(--color-text-tertiary)] mt-0.5">版本 0.1.0</div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4">
        <div className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
          Smart Space 是一个桌面客户端 + 内嵌服务端的应用，基于 Tauri + React + Node.js 构建。
        </div>
      </div>
    </div>
  );
}

function GeneralIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function AboutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}
