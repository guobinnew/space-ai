import { useState, useEffect, useMemo } from 'react';
import { useUIStore } from '../stores/uiStore';
import type { Theme } from '../stores/uiStore';
import { settingsApi } from '../api/settings';
import { ProviderSettings } from '../components/settings/ProviderSettings';
import { SkillsSettings } from '../components/settings/SkillsSettings';
import { ComputerUseSettings } from '../components/settings/ComputerUseSettings';
import { MemorySettings } from '../components/settings/MemorySettings';
import { AgentSettings } from '../components/settings/AgentSettings';
import { useTranslation } from '../i18n';
import { filesystemApi, type DirEntry } from '../api/filesystem';
import { MarkdownRenderer } from '../components/markdown/MarkdownRenderer';

type SettingsCategory = 'general' | 'providers' | 'skills' | 'computerUse' | 'memory' | 'agents' | 'about';

export function SettingsPage() {
  const t = useTranslation();
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('general');

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--color-surface)]">
      <div className="flex-1 flex overflow-hidden">
        {/* Category navigation */}
        <div className="w-[180px] border-r border-[var(--color-border)] py-3 flex-shrink-0 flex flex-col">
          <div className="flex-1">
            <CategoryButton
              icon={<GeneralIcon />}
              label={t('settings.general')}
              active={activeCategory === 'general'}
              onClick={() => setActiveCategory('general')}
            />
            <CategoryButton
              icon={<ProvidersIcon />}
              label={t('settings.providers')}
              active={activeCategory === 'providers'}
              onClick={() => setActiveCategory('providers')}
            />
            <CategoryButton
              icon={<SkillsIcon />}
              label={t('settings.skills')}
              active={activeCategory === 'skills'}
              onClick={() => setActiveCategory('skills')}
            />
            <CategoryButton
              icon={<ComputerUseIcon />}
              label={t('settings.computerUse')}
              active={activeCategory === 'computerUse'}
              onClick={() => setActiveCategory('computerUse')}
            />
            <CategoryButton
              icon={<MemoryIcon />}
              label={t('settings.memory')}
              active={activeCategory === 'memory'}
              onClick={() => setActiveCategory('memory')}
            />
            <CategoryButton
              icon={<AgentIcon />}
              label={t('settings.agents')}
              active={activeCategory === 'agents'}
              onClick={() => setActiveCategory('agents')}
            />
          </div>
          <div className="border-t border-[var(--color-border)] pt-1">
            <CategoryButton
              icon={<AboutIcon />}
              label={t('settings.about')}
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
          {activeCategory === 'agents' && <AgentSettings />}
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
  const t = useTranslation();
  const { theme, setTheme, locale, setLocale, defaultWorkDir, setDefaultWorkDir, notifyOnCompletion, setNotifyOnCompletion } = useUIStore();
  const [webSearchProvider, setWebSearchProvider] = useState<'zhipu' | 'none'>('none');
  const [webSearchApiKey, setWebSearchApiKey] = useState('');

  useEffect(() => {
    void settingsApi.get().then(({ settings }) => {
      setWebSearchProvider(settings.webSearch.provider);
      setWebSearchApiKey(settings.webSearch.apiKey);
    }).catch(() => {});
  }, []);

  const updateWebSearch = (provider: 'zhipu' | 'none', apiKey: string) => {
    setWebSearchProvider(provider);
    setWebSearchApiKey(apiKey);
    void settingsApi.update({ webSearch: { provider, apiKey } }).catch(() => {});
  };

  const themes: Array<{ value: Theme; label: string }> = [
    { value: 'light', label: t('settings.general.light') },
    { value: 'dark', label: t('settings.general.dark') },
  ];

  const locales: Array<{ value: typeof locale; label: string }> = [
    { value: 'zh', label: t('settings.general.langZh') },
    { value: 'en', label: t('settings.general.langEn') },
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
    <div className="w-full">
      {/* Appearance */}
      <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">{t('settings.general.appearance')}</h2>
      <p className="text-sm text-[var(--color-text-tertiary)] mb-3">{t('settings.general.appearanceDesc')}</p>
      <div className="flex gap-2 mb-8 max-w-md">
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
      <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">{t('settings.general.language')}</h2>
      <p className="text-sm text-[var(--color-text-tertiary)] mb-3">{t('settings.general.languageDesc')}</p>
      <div className="flex gap-2 mb-8 max-w-md">
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
      <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">{t('settings.general.workDir')}</h2>
      <p className="text-sm text-[var(--color-text-tertiary)] mb-3">{t('settings.general.workDirDesc')}</p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={defaultWorkDir}
          onChange={(e) => setDefaultWorkDir(e.target.value)}
          className="flex-1 h-9 px-3 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
          placeholder={t('settings.general.workDirPlaceholder')}
        />
        <button
          onClick={handlePickDir}
          className="flex-shrink-0 px-3 py-2 text-xs font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          {t('settings.general.browse')}
        </button>
      </div>

      {/* System Notification */}
      <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-1 mt-8">{t('settings.general.notification')}</h2>
      <p className="text-sm text-[var(--color-text-tertiary)] mb-3">{t('settings.general.notificationDesc')}</p>
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
          {notifyOnCompletion ? t('settings.general.notificationOn') : t('settings.general.notificationOff')}
        </span>
      </label>

      {/* Web Search */}
      <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-1 mt-8">{t('settings.webSearch')}</h2>
      <p className="text-sm text-[var(--color-text-tertiary)] mb-3">{t('settings.webSearchDesc')}</p>
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-xs text-[var(--color-text-tertiary)] mb-1 block">{t('settings.webSearchProvider')}</label>
          <select
            value={webSearchProvider}
            onChange={(e) => updateWebSearch(e.target.value as 'zhipu' | 'none', webSearchApiKey)}
            className="w-full h-9 px-3 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
          >
            <option value="none">{t('settings.webSearchNotConfigured')}</option>
            <option value="zhipu">Zhipu (BigModel)</option>
          </select>
        </div>
        {webSearchProvider !== 'none' && (
          <div>
            <label className="text-xs text-[var(--color-text-tertiary)] mb-1 block">{t('settings.webSearchApiKey')}</label>
            <input
              type="password"
              value={webSearchApiKey}
              onChange={(e) => updateWebSearch(webSearchProvider, e.target.value)}
              className="w-full h-9 px-3 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-focus)]"
              placeholder={t('settings.webSearchApiKeyPlaceholder')}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function AboutSettings() {
  const t = useTranslation();
  const [activeTab, setActiveTab] = useState<'features' | 'docs'>('features');

  const features = [
    { key: 'multiSession', icon: '💬', color: 'var(--color-brand)' },
    { key: 'streaming', icon: '⚡', color: 'var(--color-warning)' },
    { key: 'codeEditor', icon: '📝', color: 'var(--color-success)' },
    { key: 'tools', icon: '🔧', color: 'var(--color-error)' },
    { key: 'agents', icon: '🤖', color: 'var(--color-brand)' },
    { key: 'scheduled', icon: '⏰', color: 'var(--color-success)' },
    { key: 'tts', icon: '🔊', color: 'var(--color-warning)' },
    { key: 'computer', icon: '🖥️', color: 'var(--color-error)' },
    { key: 'usage', icon: '📊', color: 'var(--color-brand)' },
    { key: 'i18n', icon: '🌐', color: 'var(--color-success)' },
  ];

  const archLayers = [
    { key: 'frontend', color: 'var(--color-brand)' },
    { key: 'desktop', color: 'var(--color-success)' },
    { key: 'server', color: 'var(--color-warning)' },
    { key: 'ai', color: 'var(--color-error)' },
  ];

  const providers = [
    'Anthropic', 'OpenAI', 'Google', 'xAI', 'Mistral',
    'DeepSeek', 'Qwen', 'Zhipu', 'Moonshot', 'MiniMax',
    'Ollama', 'LM Studio',
  ];

  const techItems = [
    { name: 'Tauri v2', desc: 'Rust' },
    { name: 'React 18', desc: 'TypeScript' },
    { name: 'Vite', desc: 'HMR' },
    { name: 'Bun', desc: 'Runtime' },
    { name: 'Tailwind CSS', desc: 'v4' },
    { name: 'Monaco', desc: 'Editor' },
    { name: 'WebSocket', desc: 'Real-time' },
    { name: 'esbuild', desc: 'Bundle' },
  ];

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">{t('settings.about.title')}</h2>
        <p className="text-sm text-[var(--color-text-tertiary)] mb-6">{t('settings.about.desc')}</p>
      </div>

      {/* App identity */}
      <div className="flex items-center gap-4">
        <img
          src="/icon.png"
          alt={t('app.name')}
          className="h-16 w-16 rounded-2xl flex-shrink-0"
        />
        <div>
          <div
            className="text-lg font-bold text-[var(--color-text-primary)]"
            style={{ fontFamily: 'var(--font-headline)' }}
          >
            {t('app.name')}
          </div>
          <div className="text-sm text-[var(--color-text-tertiary)] mt-0.5">{t('settings.about.version')} {__APP_VERSION__}</div>
        </div>
      </div>

      {/* Description */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4">
        <div className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
          {t('settings.about.body')}
        </div>
      </div>

      {/* 下方区域：Tab 切换 */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] overflow-hidden">
        {/* Tab 头部 */}
        <div className="flex border-b border-[var(--color-border)] bg-[var(--color-surface-container)]">
          <TabButton
            label={t('settings.about.tab.features')}
            active={activeTab === 'features'}
            onClick={() => setActiveTab('features')}
          />
          <TabButton
            label={t('settings.about.tab.docs')}
            active={activeTab === 'docs'}
            onClick={() => setActiveTab('docs')}
          />
        </div>

        {/* Tab 内容 */}
        <div className="p-5">
          {activeTab === 'features' ? (
            <FeaturesIntroTab
              features={features}
              archLayers={archLayers}
              providers={providers}
              techItems={techItems}
            />
          ) : (
            <DocsTab />
          )}
        </div>
      </div>

      {/* Contact Author — 保留在 Tab 之外 */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4 flex items-center gap-4">
        <img src="/author.png" alt={t('about.author')} className="h-20 w-auto opacity-80" />
        <div>
          <div className="text-sm font-medium text-[var(--color-text-primary)]">{t('settings.about.contactAuthor')}</div>
          <div className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{t('settings.about.contactDesc')}</div>
        </div>
      </div>
    </div>
  );
}

/** Tab 头部按钮 */
function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
        active
          ? 'text-[var(--color-brand)] bg-[var(--color-surface-container-low)] border-b-2 border-[var(--color-brand)]'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] border-b-2 border-transparent'
      }`}
    >
      {label}
    </button>
  );
}

/** 功能介绍 Tab：原下方区域内容（核心功能 / 架构 / 技术栈 / 服务商） */
function FeaturesIntroTab({
  features,
  archLayers,
  providers,
  techItems,
}: {
  features: Array<{ key: string; icon: string; color: string }>;
  archLayers: Array<{ key: string; color: string }>;
  providers: string[];
  techItems: Array<{ name: string; desc: string }>;
}) {
  const t = useTranslation();

  return (
    <div className="space-y-6">
      {/* Core Features */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">{t('settings.about.features')}</h3>
        <div className="grid grid-cols-2 gap-2">
          {features.map((f) => (
            <div
              key={f.key}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-3 flex items-start gap-2.5"
            >
              <span className="text-base leading-none mt-0.5">{f.icon}</span>
              <div className="min-w-0">
                <div className="text-xs font-medium text-[var(--color-text-primary)]">
                  {t(`settings.about.feat.${f.key}`)}
                </div>
                <div className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5 leading-snug">
                  {t(`settings.about.feat.${f.key}Desc`)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Architecture */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">{t('settings.about.arch')}</h3>
        <div className="grid grid-cols-2 gap-2">
          {archLayers.map((layer) => (
            <div
              key={layer.key}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-3"
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: layer.color }}
                />
                <span className="text-xs font-medium text-[var(--color-text-primary)]">
                  {t(`settings.about.arch.${layer.key}`)}
                </span>
              </div>
              <div className="text-[11px] text-[var(--color-text-tertiary)] leading-snug">
                {t(`settings.about.arch.${layer.key}Desc`)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tech Stack */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">{t('settings.about.techStack')}</h3>
        <div className="flex flex-wrap gap-2">
          {techItems.map((item) => (
            <span
              key={item.name}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-3 py-1.5"
            >
              <span className="text-xs font-medium text-[var(--color-text-primary)]">{item.name}</span>
              <span className="text-[10px] text-[var(--color-text-tertiary)]">{item.desc}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Supported Providers */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">{t('settings.about.providers')}</h3>
        <div className="flex flex-wrap gap-2">
          {providers.map((name) => (
            <span
              key={name}
              className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-3 py-1 text-xs text-[var(--color-text-secondary)]"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 说明文档 Tab：左侧 doc 目录文件列表 + 右侧 MD 预览 */
const DOCS_DIR = 'D:\\Work\\SpaceAI\\doc';

function DocsTab() {
  const t = useTranslation();
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DirEntry | null>(null);
  const [content, setContent] = useState<string>('');
  const [loadingContent, setLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  // 加载 doc 目录列表
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    filesystemApi
      .browse(DOCS_DIR, { includeFiles: true })
      .then((res) => {
        if (cancelled) return;
        // 仅保留 .md 文件，按名称升序
        const mdFiles = res.entries
          .filter((e) => !e.isDirectory && /\.md$/i.test(e.name))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        setEntries(mdFiles);
        // 默认选中第一个
        if (mdFiles.length > 0) {
          setSelected(mdFiles[0]!);
        } else {
          setSelected(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[DocsTab] load failed:', err);
        setError(t('settings.about.docs.loadError'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  // 加载选中文件内容
  useEffect(() => {
    if (!selected) {
      setContent('');
      setContentError(null);
      return;
    }
    let cancelled = false;
    setLoadingContent(true);
    setContentError(null);
    filesystemApi
      .readFile(selected.path)
      .then((res) => {
        if (cancelled) return;
        setContent(res.content);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[DocsTab] read failed:', err);
        setContentError(t('settings.about.docs.readError'));
      })
      .finally(() => {
        if (!cancelled) setLoadingContent(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, t]);

  const lastModified = useMemo(() => {
    return selected?.path || '';
  }, [selected]);

  return (
    <div className="flex h-[60vh] min-h-[400px] border border-[var(--color-border)] rounded-lg overflow-hidden">
      {/* 左侧：文档列表 */}
      <div className="w-[240px] flex-shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col">
        <div className="px-3 py-2 text-xs font-medium text-[var(--color-text-tertiary)] border-b border-[var(--color-border)] bg-[var(--color-surface-container)] truncate" title={DOCS_DIR}>
          📁 doc
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {loading ? (
            <div className="px-3 py-2 text-xs text-[var(--color-text-tertiary)]">{t('settings.about.docs.loading')}</div>
          ) : error ? (
            <div className="px-3 py-2 text-xs text-[var(--color-error)]">{error}</div>
          ) : entries.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--color-text-tertiary)]">{t('settings.about.docs.empty')}</div>
          ) : (
            entries.map((entry) => (
              <button
                key={entry.path}
                onClick={() => setSelected(entry)}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${
                  selected?.path === entry.path
                    ? 'bg-[var(--color-surface-selected)] text-[var(--color-brand)] font-medium'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
                }`}
                title={entry.name}
              >
                <span className="text-[11px] flex-shrink-0">📄</span>
                <span className="truncate flex-1">{entry.name}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* 右侧：MD 预览 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部路径栏 */}
        {selected && (
          <div className="px-4 py-2 text-xs text-[var(--color-text-tertiary)] border-b border-[var(--color-border)] bg-[var(--color-surface-container)] truncate" title={lastModified}>
            {selected.name}
          </div>
        )}
        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-sm text-[var(--color-text-tertiary)]">
              {t('settings.about.docs.selectHint')}
            </div>
          ) : loadingContent ? (
            <div className="h-full flex items-center justify-center text-sm text-[var(--color-text-tertiary)]">
              {t('settings.about.docs.loading')}
            </div>
          ) : contentError ? (
            <div className="h-full flex items-center justify-center text-sm text-[var(--color-error)]">
              {contentError}
            </div>
          ) : (
            <div className="px-6 py-4 max-w-[820px] mx-auto">
              <MarkdownRenderer content={content} />
            </div>
          )}
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

function AgentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" />
      <line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" />
      <line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" />
      <line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" />
      <line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  );
}
