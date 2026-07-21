import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { settingsApi, type GeneralSettings } from '../api/settings';

export type TabType = 'home' | 'settings' | 'session';
export type Theme = 'dark' | 'light';
export type Locale = 'zh' | 'en';

export interface Tab {
  id: string;
  title: string;
  type: TabType;
  closable: boolean;
}

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  locale: Locale;
  setLocale: (l: Locale) => void;
  defaultWorkDir: string;
  setDefaultWorkDir: (dir: string) => void;
  notifyOnCompletion: boolean;
  setNotifyOnCompletion: (v: boolean) => void;
  tabs: Tab[];
  activeTabId: string;
  setActiveTab: (id: string) => void;
  openTab: (id: string, title: string, type: TabType, closable?: boolean) => void;
  updateTabTitle: (id: string, title: string) => void;
  closeTab: (id: string) => void;
}

const UIContext = createContext<UIState | null>(null);

export const HOME_TAB_ID = 'home';
export const SETTINGS_TAB_ID = 'settings';

/** 默认值（服务端未启动或加载失败时使用） */
const DEFAULT_THEME: Theme = 'dark';
const DEFAULT_LOCALE: Locale = 'zh';

export function UIProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [defaultWorkDir, setDefaultWorkDirState] = useState<string>('');
  const [notifyOnCompletion, setNotifyOnCompletionState] = useState<boolean>(false);
  const [tabs, setTabs] = useState<Tab[]>([
    { id: HOME_TAB_ID, title: '首页', type: 'home', closable: false },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(HOME_TAB_ID);

  // 初次挂载：从服务端加载通用设置（统一存储在 ~/.spaceai/settings.json）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { settings } = await settingsApi.get();
        if (cancelled) return;
        setTheme(settings.theme);
        setLocaleState(settings.locale);
        setDefaultWorkDirState(settings.defaultWorkDir);
        setNotifyOnCompletionState(settings.notifyOnCompletion);
      } catch {
        // 服务端未就绪或读取失败 — 使用默认值
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // theme 变化：应用到 DOM + 持久化到服务端
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // locale 变化：应用到 DOM
  useEffect(() => {
    document.documentElement.setAttribute('data-locale', locale);
  }, [locale]);

  // 持久化到服务端的 setter（局部更新，失败静默）
  const persist = (partial: Partial<GeneralSettings>) => {
    void settingsApi.update(partial).catch(() => {
      /* 服务端未就绪或写入失败 — 忽略，下次启动会重新同步 */
    });
  };

  const toggleSidebar = () => setSidebarOpen((s) => !s);
  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      persist({ theme: next });
      return next;
    });
  };
  const setThemeMode = (next: Theme) => {
    setTheme(next);
    persist({ theme: next });
  };
  const setLocale = (l: Locale) => {
    setLocaleState(l);
    persist({ locale: l });
  };
  const setDefaultWorkDir = (dir: string) => {
    setDefaultWorkDirState(dir);
    persist({ defaultWorkDir: dir });
  };
  const setNotifyOnCompletion = (v: boolean) => {
    setNotifyOnCompletionState(v);
    persist({ notifyOnCompletion: v });
  };

  // toggleTheme 已持久化（见上）

  const openTab = (id: string, title: string, type: TabType, closable = true) => {
    setTabs((prev) => (prev.some((t) => t.id === id) ? prev : [...prev, { id, title, type, closable }]));
    setActiveTabId(id);
  };

  // 同步服务端自动生成的会话标题到页签
  const updateTabTitle = (id: string, title: string) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
  };

  const closeTab = (id: string) => {
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const next = tabs.filter((t) => t.id !== id);
    setTabs(next);
    if (activeTabId === id) {
      const neighbor = next[idx] || next[idx - 1] || next[0];
      setActiveTabId(neighbor ? neighbor.id : HOME_TAB_ID);
    }
  };

  return (
    <UIContext.Provider
      value={{
        sidebarOpen,
        toggleSidebar,
        theme,
        toggleTheme,
        setTheme: setThemeMode,
        locale,
        setLocale,
        defaultWorkDir,
        setDefaultWorkDir,
        notifyOnCompletion,
        setNotifyOnCompletion,
        tabs,
        activeTabId,
        setActiveTab: setActiveTabId,
        openTab,
        updateTabTitle,
        closeTab,
      }}
    >
      {children}
    </UIContext.Provider>
  );
}

export function useUIStore(): UIState {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUIStore must be used within UIProvider');
  return ctx;
}
