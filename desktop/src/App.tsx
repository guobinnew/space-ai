import { useState, useEffect } from 'react';

interface ServerInfo {
  name: string;
  version: string;
  nodeVersion: string;
  platform: string;
  uptime: number;
}

function App() {
  const [serverStatus, setServerStatus] = useState<string>('checking...');
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkServer = async () => {
      if (cancelled) return;
      try {
        const res = await fetch('http://127.0.0.1:3721/api/health');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setServerStatus('connected');
          setServerInfo(data);
        }
      } catch {
        if (!cancelled) {
          setServerStatus('disconnected');
          setTimeout(checkServer, 2000);
        }
      }
    };

    // Also fetch server info
    const fetchInfo = async () => {
      try {
        const res = await fetch('http://127.0.0.1:3721/api/info');
        if (res.ok) {
          const info: ServerInfo = await res.json();
          if (!cancelled) setServerInfo(info);
        }
      } catch {
        // ignore
      }
    };

    checkServer().then(() => {
      if (!cancelled) fetchInfo();
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="container">
      <header className="header">
        <h1>Smart Space</h1>
        <p className="subtitle">Desktop Client + Embedded Server</p>
      </header>

      <div className="card">
        <div className="status-row">
          <span className="label">Server Status</span>
          <span className={`badge ${serverStatus === 'connected' ? 'badge-ok' : serverStatus === 'disconnected' ? 'badge-err' : 'badge-pending'}`}>
            {serverStatus}
          </span>
        </div>
        {serverInfo && (
          <pre className="info-block">{JSON.stringify(serverInfo, null, 2)}</pre>
        )}
      </div>

      <footer className="footer">
        <p>Tauri + React + Node.js</p>
      </footer>
    </div>
  );
}

export default App;
