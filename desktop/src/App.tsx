import { AppShell } from './components/layout/AppShell';
import { UIProvider } from './stores/uiStore';
import { SessionProvider } from './stores/sessionStore';
import { ChatProvider } from './stores/chatStore';
import { TaskProvider } from './stores/cliTaskStore';

function App() {
  return (
    <UIProvider>
      <SessionProvider>
        <ChatProvider>
          <TaskProvider>
            <AppShell />
          </TaskProvider>
        </ChatProvider>
      </SessionProvider>
    </UIProvider>
  );
}

export default App;
