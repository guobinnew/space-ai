import { useUIStore } from '../../stores/uiStore';
import { HomePage } from '../../pages/HomePage';
import { SettingsPage } from '../../pages/SettingsPage';
import { ActiveSession } from '../../pages/ActiveSession';
import { EmptySession } from '../../pages/EmptySession';

export function ContentRouter() {
  const { tabs, activeTabId } = useUIStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  // 所有 session tab 保持挂载：切换 tab 不断开 WS，仅隐藏非激活的；
  // 关闭 tab 时组件才卸载，由其 cleanup 断开 WS。
  const sessionTabs = tabs.filter((t) => t.type === 'session');
  const isSessionActive = activeTab?.type === 'session';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* session tab 常驻挂载，通过 display 控制显隐 */}
      {sessionTabs.map((tab) => (
        <div
          key={tab.id}
          className="flex-1 flex flex-col overflow-hidden"
          style={{ display: tab.id === activeTabId ? 'flex' : 'none' }}
        >
          <ActiveSession sessionId={tab.id} />
        </div>
      ))}

      {/* 非 session 激活页（home/settings/empty）仅在非 session 激活时渲染 */}
      {!isSessionActive && activeTab?.type === 'settings' && <SettingsPage />}
      {!isSessionActive && activeTab?.type === 'home' && <HomePage />}
      {!isSessionActive && !activeTab && <EmptySession />}
    </div>
  );
}
