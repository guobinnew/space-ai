import { useUIStore } from '../../stores/uiStore';
import { HomePage } from '../../pages/HomePage';
import { SettingsPage } from '../../pages/SettingsPage';

export function ContentRouter() {
  const { tabs, activeTabId } = useUIStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  if (!activeTab) {
    return <HomePage />;
  }

  if (activeTab.type === 'settings') {
    return <SettingsPage />;
  }

  return <HomePage />;
}
