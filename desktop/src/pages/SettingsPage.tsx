import { useState } from 'react';
import { useUIStore } from '../stores/uiStore';
import type { Theme } from '../stores/uiStore';
import { ProviderSettings } from '../components/settings/ProviderSettings';
import { SkillsSettings } from '../components/settings/SkillsSettings';
import { ComputerUseSettings } from '../components/settings/ComputerUseSettings';
import { MemorySettings } from '../components/settings/MemorySettings';

type SettingsCategory = 'general' | 'providers' | 'skills' | 'computerUse' | 'memory' | 'about';

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
            <CategoryButton
              icon={<ProvidersIcon />}
              label="服务商"
              active={activeCategory === 'providers'}
              onClick={() => setActiveCategory('providers')}
            />
            <CategoryButton
              icon={<SkillsIcon />}
              label="技能"
              active={activeCategory === 'skills'}
              onClick={() => setActiveCategory('skills')}
            />
            <CategoryButton
              icon={<ComputerUseIcon />}
              label="计算机操作"
              active={activeCategory === 'computerUse'}
              onClick={() => setActiveCategory('computerUse')}
            />
            <CategoryButton
              icon={<MemoryIcon />}
              label="存储"
              active={activeCategory === 'memory'}
              onClick={() => setActiveCategory('memory')}
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
          {activeCategory === 'providers' && <ProviderSettings />}
          {activeCategory === 'skills' && <SkillsSettings />}
          {activeCategory === 'computerUse' && <ComputerUseSettings />}
          {activeCategory === 'memory' && <MemorySettings />}
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
  const { theme, setTheme, locale, setLocale, defaultWorkDir, setDefaultWorkDir, notifyOnCompletion, setNotifyOnCompletion } = useUIStore();

  const themes: Array<{ value: Theme; label: string }> = [
    { value: 'light', label: '浅色' },
    { value: 'dark', label: '深色' },
  ];

  const locales: Array<{ value: typeof locale; label: string }> = [
    { value: 'zh', label: '中文' },
    { value: 'en', label: 'English' },
  ];

  const handlePickDir = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === 'string') {
        setDefaultWorkDir(selected);
      }
    } catch {
      // Not in Tauri or dialog cancelled
    }
  };

  return (
    <div className="max-w-xl">
      {/* Appearance */}
      <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">外观</h2>
      <p className="text-sm text-[var(--color-text-tertiary)] mb-3">切换应用的明暗主题</p>
      <div className="flex gap-2 mb-8">
        {themes.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setTheme(value)}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${
              theme === value
                ? 'text-[var(--color-btn-primary-fg)] border-transparent shadow-[var(--shadow-button-primary)]'
                : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
            }`}
            style={theme === value ? { background: 'var(--gradient-btn-primary)' } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Language */}
      <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">语言</h2>
      <p className="text-sm text-[var(--color-text-tertiary)] mb-3">选择界面语言</p>
      <div className="flex gap-2 mb-8">
        {locales.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setLocale(value)}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${
              locale === value
                ? 'text-[var(--color-btn-primary-fg)] border-transparent shadow-[var(--shadow-button-primary)]'
                : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
            }`}
            style={locale === value ? { background: 'var(--gradient-btn-primary)' } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Default Working Directory */}
      <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">默认工作目录</h2>
      <p className="text-sm text-[var(--color-text-tertiary)] mb-3">新建会话时的默认工作目录</p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={defaultWorkDir}
          onChange={(e) => setDefaultWorkDir(e.target.value)}
          className="flex-1 h-9 px-3 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
          placeholder="选择或输入工作目录路径"
        />
        <button
          onClick={handlePickDir}
          className="flex-shrink-0 px-3 py-2 text-xs font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          浏览
        </button>
      </div>

      {/* System Notification */}
      <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-1 mt-8">系统通知</h2>
      <p className="text-sm text-[var(--color-text-tertiary)] mb-3">当应用窗口最小化或不在前台时，会话回复完成后通过系统通知提醒你</p>
      <label className="flex items-center gap-3 cursor-pointer">
        <button
          type="button"
          role="switch"
          aria-checked={notifyOnCompletion}
          onClick={() => setNotifyOnCompletion(!notifyOnCompletion)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            notifyOnCompletion ? 'bg-[var(--color-brand)]' : 'bg-[var(--color-surface-container-high)]'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              notifyOnCompletion ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
        <span className="text-sm text-[var(--color-text-secondary)]">
          {notifyOnCompletion ? '已开启' : '已关闭'}
        </span>
      </label>
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
          Smart Space 是一个桌面客户端 + 内嵌服务端的应用，基于 Tauri + React + Bun 构建。
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

function ProvidersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
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

function SkillsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7z" />
    </svg>
  );
}

function ComputerUseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function MemoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  );
}
