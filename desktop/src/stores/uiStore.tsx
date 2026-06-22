import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type TabType = 'home' | 'settings';
export type Theme = 'dark' | 'light';

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

export function UIProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
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

  const toggleSidebar = () => setSidebarOpen((s) => !s);
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

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
      value={{ sidebarOpen, toggleSidebar, theme, toggleTheme, tabs, activeTabId, setActiveTab: setActiveTabId, openTab, closeTab }}
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
