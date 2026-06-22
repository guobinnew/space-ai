import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ServerInfo {
  name: string;
  version: string;
  nodeVersion: string;
  platform: string;
  uptime: number;
}

type ServerStatus = 'checking' | 'connected' | 'disconnected';

export function HomePage() {
  const [serverStatus, setServerStatus] = useState<ServerStatus>('checking');
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkServer = async () => {
      if (cancelled) return;
      try {
        const res = await fetch('http://127.0.0.1:3721/api/health');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json();
        if (!cancelled) {
          setServerStatus('connected');
        }
      } catch {
        if (!cancelled) {
          setServerStatus('disconnected');
          setTimeout(checkServer, 2000);
        }
      }
    };

    const fetchInfo = async () => {
      try {
        const res = await fetch('http://127.0.0.1:3721/api/info');
        if (res.ok) {
          const info: ServerInfo = await res.json();
          if (!cancelled) setServerInfo(info);
        }
      } catch {
        /* ignore */
      }
    };

    void checkServer().then(() => {
      if (!cancelled) void fetchInfo();
    });

    setTimeout(() => {
      invoke('close_splashscreen').catch(console.error);
    }, 500);

    return () => {
      cancelled = true;
    };
  }, []);

  const statusLabel: Record<ServerStatus, string> = {
    checking: '检测中',
    connected: '已连接',
    disconnected: '未连接',
  };

  const statusBadgeClass: Record<ServerStatus, string> = {
    checking: 'bg-[rgba(251,191,36,0.12)] text-[var(--color-warning)]',
    connected: 'bg-[rgba(74,222,128,0.12)] text-[var(--color-success)]',
    disconnected: 'bg-[rgba(248,113,113,0.12)] text-[var(--color-error)]',
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--color-surface)]">
      <div className="mx-auto max-w-4xl px-8 py-12">
        {/* Welcome */}
        <div className="mb-10">
          <div className="flex items-center gap-4 mb-4">
            <div
              className="h-16 w-16 rounded-2xl flex-shrink-0 flex items-center justify-center text-white text-2xl font-bold"
              style={{ background: 'var(--gradient-btn-primary)', boxShadow: 'var(--shadow-dropdown)' }}
            >
              S
            </div>
            <div>
              <h1
                className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]"
                style={{ fontFamily: 'var(--font-headline)' }}
              >
                欢迎使用 Smart Space
              </h1>
              <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                桌面客户端 + 内嵌服务端
              </p>
            </div>
          </div>
        </div>

        {/* Server status card */}
        <div className="mb-10">
          <h2 className="text-sm font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">
            服务状态
          </h2>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--color-text-primary)]">后端服务</span>
              <span
                className={`text-xs font-semibold px-3 py-1 rounded-full ${statusBadgeClass[serverStatus]}`}
              >
                {statusLabel[serverStatus]}
              </span>
            </div>

            {serverInfo && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <InfoCell label="名称" value={serverInfo.name} />
                <InfoCell label="版本" value={serverInfo.version} />
                <InfoCell label="Node" value={serverInfo.nodeVersion} />
                <InfoCell label="平台" value={serverInfo.platform} />
              </div>
            )}

            {serverStatus === 'disconnected' && (
              <p className="mt-4 text-xs text-[var(--color-text-tertiary)]">
                正在尝试重新连接内嵌服务端 (127.0.0.1:3721)…
              </p>
            )}
          </div>
        </div>

        {/* Tech stack */}
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">
            技术栈
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <TechCard name="Tauri" desc="桌面框架" />
            <TechCard name="React" desc="前端 UI" />
            <TechCard name="Node.js" desc="内嵌服务" />
            <TechCard name="Tailwind" desc="样式系统" />
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--color-surface-container)] px-3 py-2">
      <div className="text-[11px] text-[var(--color-text-tertiary)]">{label}</div>
      <div className="text-sm font-medium text-[var(--color-text-primary)] truncate" style={{ fontFamily: 'var(--font-mono)' }}>
        {value}
      </div>
    </div>
  );
}

function TechCard({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4">
      <div className="text-base font-bold text-[var(--color-text-primary)]" style={{ fontFamily: 'var(--font-headline)' }}>
        {name}
      </div>
      <div className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{desc}</div>
    </div>
  );
}
