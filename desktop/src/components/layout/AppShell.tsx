import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { ContentRouter } from './ContentRouter';
import { useUIStore } from '../../stores/uiStore';

export function AppShell() {
  const { sidebarOpen } = useUIStore();

  return (
    <div className="h-screen flex overflow-hidden bg-[var(--color-surface)]">
      <div
        data-testid="sidebar-shell"
        data-state={sidebarOpen ? 'open' : 'closed'}
        className="sidebar-shell"
      >
        <Sidebar />
      </div>
      <main
        id="content-area"
        data-sidebar-state={sidebarOpen ? 'open' : 'closed'}
        className="min-w-0 flex-1 flex flex-col overflow-hidden"
      >
        <TabBar />
        <ContentRouter />
      </main>
    </div>
  );
}
