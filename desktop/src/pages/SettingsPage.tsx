import { useUIStore } from '../stores/uiStore';

export function SettingsPage() {
  const { theme, toggleTheme } = useUIStore();

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--color-surface)]">
      <div className="mx-auto max-w-3xl px-8 py-12">
        <h1
          className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] mb-8"
          style={{ fontFamily: 'var(--font-headline)' }}
        >
          设置
        </h1>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-6">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">外观</h2>
          <p className="text-xs text-[var(--color-text-tertiary)] mb-4">切换应用的明暗主题</p>

          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--color-text-secondary)]">
              当前主题：{theme === 'dark' ? '深色' : '浅色'}
            </span>
            <button
              onClick={toggleTheme}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-[var(--color-btn-primary-fg)] transition-all hover:brightness-105"
              style={{ background: 'var(--gradient-btn-primary)', boxShadow: 'var(--shadow-button-primary)' }}
            >
              切换为{theme === 'dark' ? '浅色' : '深色'}
            </button>
          </div>
        </section>

        <p className="mt-8 text-center text-xs text-[var(--color-text-tertiary)]">
          更多设置项开发中
        </p>
      </div>
    </div>
  );
}
