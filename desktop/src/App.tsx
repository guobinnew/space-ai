import { AppShell } from './components/layout/AppShell';
import { UIProvider } from './stores/uiStore';
import { SessionProvider } from './stores/sessionStore';
import { ChatProvider } from './stores/chatStore';

function App() {
  return (
    <UIProvider>
      <SessionProvider>
        <ChatProvider>
          <AppShell />
        </ChatProvider>
      </SessionProvider>
    </UIProvider>
  );
}

export default App;
