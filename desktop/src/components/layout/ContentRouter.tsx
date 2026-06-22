import { useUIStore } from '../../stores/uiStore';
import { HomePage } from '../../pages/HomePage';
import { SettingsPage } from '../../pages/SettingsPage';
import { ActiveSession } from '../../pages/ActiveSession';
import { EmptySession } from '../../pages/EmptySession';

export function ContentRouter() {
  const { tabs, activeTabId } = useUIStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  if (!activeTab) {
    return <EmptySession />;
  }

  if (activeTab.type === 'settings') {
    return <SettingsPage />;
  }

  if (activeTab.type === 'session') {
    return <ActiveSession sessionId={activeTab.id} />;
  }

  return <HomePage />;
}
