import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

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
  closeTab: (id: string) => void;
}

const UIContext = createContext<UIState | null>(null);

export const HOME_TAB_ID = 'home';
export const SETTINGS_TAB_ID = 'settings';

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem('smartspace-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* localStorage unavailable */
  }
  return 'dark';
}

function getInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem('smartspace-locale');
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    /* localStorage unavailable */
  }
  return 'zh';
}

function getInitialWorkDir(): string {
  try {
    return localStorage.getItem('smartspace-workdir') || '';
  } catch {
    return '';
  }
}

function getInitialNotify(): boolean {
  try {
    return localStorage.getItem('smartspace-notify') === 'true';
  } catch {
    return false;
  }
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);
  const [defaultWorkDir, setDefaultWorkDirState] = useState<string>(getInitialWorkDir);
  const [notifyOnCompletion, setNotifyOnCompletionState] = useState<boolean>(getInitialNotify);
  const [tabs, setTabs] = useState<Tab[]>([
    { id: HOME_TAB_ID, title: '首页', type: 'home', closable: false },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(HOME_TAB_ID);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('smartspace-theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-locale', locale);
    try {
      localStorage.setItem('smartspace-locale', locale);
    } catch {
      /* ignore */
    }
  }, [locale]);

  useEffect(() => {
    try {
      localStorage.setItem('smartspace-workdir', defaultWorkDir);
    } catch {
      /* ignore */
    }
  }, [defaultWorkDir]);

  useEffect(() => {
    try {
      localStorage.setItem('smartspace-notify', String(notifyOnCompletion));
    } catch {
      /* ignore */
    }
  }, [notifyOnCompletion]);

  const toggleSidebar = () => setSidebarOpen((s) => !s);
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  const setThemeMode = (next: Theme) => setTheme(next);
  const setLocale = (l: Locale) => setLocaleState(l);
  const setDefaultWorkDir = (dir: string) => setDefaultWorkDirState(dir);
  const setNotifyOnCompletion = (v: boolean) => setNotifyOnCompletionState(v);

  const openTab = (id: string, title: string, type: TabType, closable = true) => {
    setTabs((prev) => (prev.some((t) => t.id === id) ? prev : [...prev, { id, title, type, closable }]));
    setActiveTabId(id);
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
      value={{ sidebarOpen, toggleSidebar, theme, toggleTheme, setTheme: setThemeMode, locale, setLocale, defaultWorkDir, setDefaultWorkDir, notifyOnCompletion, setNotifyOnCompletion, tabs, activeTabId, setActiveTab: setActiveTabId, openTab, closeTab }}
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
