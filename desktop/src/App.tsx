import { AppShell } from './components/layout/AppShell';
import { UIProvider } from './stores/uiStore';

function App() {
  return (
    <UIProvider>
      <AppShell />
    </UIProvider>
  );
}

export default App;
