import { AppShell } from './components/layout/AppShell';
import { UIProvider } from './stores/uiStore';
import { SessionProvider } from './stores/sessionStore';

function App() {
  return (
    <UIProvider>
      <SessionProvider>
        <AppShell />
      </SessionProvider>
    </UIProvider>
  );
}

export default App;
