/**
 * ComputerUseSettings — 计算机操作设置
 *
 * 参照 smart-code ComputerUseSettings 复刻。
 * 包含环境检测、授权应用管理、Grant Flags 开关。
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  computerUseApi,
  type ComputerUseStatus,
  type SetupResult,
  type InstalledApp,
  type AuthorizedApp,
} from '../../api/features';
import { useTranslation } from '../../i18n';

type CheckState = 'loading' | 'ready' | 'error';

const PYTHON_DOWNLOAD_URLS: Record<string, string> = {
  darwin: 'https://www.python.org/downloads/macos/',
  win32: 'https://www.python.org/downloads/windows/',
};

// ─── Inline SVG Icons ───

function CheckCircleIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  );
}

function CancelIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z" />
    </svg>
  );
}

function HelpIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function RefreshIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function DownloadIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function SpinnerIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function VerifiedIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1L9.5 3.5L6 3l-1 3.5L1.5 8l1 3.5L1 15l3 2l-.5 3.5L7 22l2.5-2L12 23l2.5-3l3.5 1.5L18 18l3-2l-1.5-3.5L22 9l-3.5-1.5L18 4l-3.5 1L12 1zm-1.5 15.5l-4-4L8 11l2.5 2.5L16 8l1.5 1.5l-7 7z" />
    </svg>
  );
}

// ─── Status Components ───

function StatusIcon({ ok }: { ok: boolean | null }) {
  if (ok === null) {
    return <HelpIcon className="text-[var(--color-text-tertiary)]" />;
  }
  return ok ? (
    <CheckCircleIcon className="text-[var(--color-success)]" />
  ) : (
    <CancelIcon className="text-[var(--color-error)]" />
  );
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean | null; detail: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-4 rounded-lg bg-[var(--color-surface-container-low)]">
      <StatusIcon ok={ok} />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">{label}</span>
        <span className="ml-2 text-xs text-[var(--color-text-tertiary)]">{detail}</span>
      </div>
    </div>
  );
}

async function openExternalUrl(url: string) {
  try {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

// ─── Main Component ───

export function ComputerUseSettings() {
  const t = useTranslation();
  const [status, setStatus] = useState<ComputerUseStatus | null>(null);
  const [checkState, setCheckState] = useState<CheckState>('loading');
  const [setupRunning, setSetupRunning] = useState(false);
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null);

  // App authorization state
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const [authorizedBundleIds, setAuthorizedBundleIds] = useState<Set<string>>(new Set());
  const [authorizedApps, setAuthorizedApps] = useState<AuthorizedApp[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsSaved, setAppsSaved] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [clipboardAccess, setClipboardAccess] = useState(true);
  const [systemKeys, setSystemKeys] = useState(true);

  const fetchStatus = useCallback(async () => {
    setCheckState('loading');
    try {
      const s = await computerUseApi.getStatus();
      setStatus(s);
      setCheckState('ready');
    } catch {
      setCheckState('error');
    }
  }, []);

  const fetchApps = useCallback(async () => {
    setAppsLoading(true);
    try {
      const [appsResult, configResult] = await Promise.all([
        computerUseApi.getInstalledApps(),
        computerUseApi.getAuthorizedApps(),
      ]);
      setInstalledApps(appsResult.apps);
      setAuthorizedApps(configResult.authorizedApps);
      setAuthorizedBundleIds(new Set(configResult.authorizedApps.map((a) => a.bundleId)));
      setClipboardAccess(configResult.grantFlags.clipboardRead);
      setSystemKeys(configResult.grantFlags.systemKeyCombos);
    } catch {
      // API not ready
    } finally {
      setAppsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // Load apps when environment is ready
  const envReady = status?.venv.created && status?.dependencies.installed;
  useEffect(() => {
    if (envReady) void fetchApps();
  }, [envReady, fetchApps]);

  const handleSetup = async () => {
    setSetupRunning(true);
    setSetupResult(null);
    try {
      const result = await computerUseApi.runSetup();
      setSetupResult(result);
      await fetchStatus();
      if (result.success) await fetchApps();
    } catch {
      setSetupResult({ success: false, steps: [{ name: 'error', ok: false, message: 'Request failed' }] });
    } finally {
      setSetupRunning(false);
    }
  };

  const toggleApp = (app: InstalledApp) => {
    const newSet = new Set(authorizedBundleIds);
    let newAuthorized = [...authorizedApps];
    if (newSet.has(app.bundleId)) {
      newSet.delete(app.bundleId);
      newAuthorized = newAuthorized.filter((a) => a.bundleId !== app.bundleId);
    } else {
      newSet.add(app.bundleId);
      newAuthorized.push({
        bundleId: app.bundleId,
        displayName: app.displayName,
        authorizedAt: new Date().toISOString(),
      });
    }
    setAuthorizedBundleIds(newSet);
    setAuthorizedApps(newAuthorized);

    // Auto-save
    void computerUseApi
      .setAuthorizedApps({
        authorizedApps: newAuthorized,
        grantFlags: { clipboardRead: clipboardAccess, clipboardWrite: clipboardAccess, systemKeyCombos: systemKeys },
      })
      .then(() => {
        setAppsSaved(true);
        setTimeout(() => setAppsSaved(false), 1500);
      });
  };

  const toggleFlag = (flag: 'clipboard' | 'systemKeys', value: boolean) => {
    if (flag === 'clipboard') setClipboardAccess(value);
    else setSystemKeys(value);

    void computerUseApi.setAuthorizedApps({
      authorizedApps,
      grantFlags: {
        clipboardRead: flag === 'clipboard' ? value : clipboardAccess,
        clipboardWrite: flag === 'clipboard' ? value : clipboardAccess,
        systemKeyCombos: flag === 'systemKeys' ? value : systemKeys,
      },
    });
  };

  const allReady =
    status?.supported && status.python.installed && status.venv.created && status.dependencies.installed;

  const pythonDownloadUrl = status
    ? PYTHON_DOWNLOAD_URLS[status.platform] ?? 'https://www.python.org/downloads/'
    : 'https://www.python.org/downloads/';

  // Filter apps by search query
  const filteredApps = useMemo(() => {
    if (!searchQuery) return installedApps;
    const q = searchQuery.toLowerCase();
    return installedApps.filter(
      (a) => a.displayName.toLowerCase().includes(q) || a.bundleId.toLowerCase().includes(q),
    );
  }, [installedApps, searchQuery]);

  // Sort: authorized apps first, then alphabetical
  const sortedApps = useMemo(() => {
    return [...filteredApps].sort((a, b) => {
      const aAuth = authorizedBundleIds.has(a.bundleId) ? 0 : 1;
      const bAuth = authorizedBundleIds.has(b.bundleId) ? 0 : 1;
      if (aAuth !== bAuth) return aAuth - bAuth;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [filteredApps, authorizedBundleIds]);

  return (
    <div className="max-w-2xl space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          {t('settings.computerUse.title')}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          {t('settings.computerUse.desc')}
        </p>
      </div>

      {checkState === 'loading' ? (
        <div className="py-8 flex justify-center">
          <SpinnerIcon className="text-[var(--color-brand)]" />
        </div>
      ) : checkState === 'error' ? (
        <div className="py-8 text-center text-sm text-[var(--color-error)]">
          {t('settings.computerUse.checkFailed')}
          <button onClick={() => void fetchStatus()} className="ml-2 underline">
            {t('settings.computerUse.recheckBtn')}
          </button>
        </div>
      ) : status ? (
        <>
          {!status.supported && (
            <div className="px-4 py-3 rounded-lg bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30 text-sm text-[var(--color-warning)]">
              {t('settings.computerUse.notSupported')}
            </div>
          )}

          {/* Status checks */}
          <div className="space-y-2">
            <StatusRow
              label={t('settings.computerUse.python')}
              ok={status.python.installed}
              detail={
                status.python.installed
                  ? `${t('settings.computerUse.pythonFound')} — ${status.python.version} (${status.python.path})`
                  : t('settings.computerUse.pythonNotFound')
              }
            />
            <StatusRow
              label={t('settings.computerUse.venv')}
              ok={status.venv.created}
              detail={status.venv.created ? `${t('settings.computerUse.venvReady')} — ${status.venv.path}` : t('settings.computerUse.venvNotReady')}
            />
            <StatusRow
              label={t('settings.computerUse.deps')}
              ok={status.dependencies.installed}
              detail={status.dependencies.installed ? t('settings.computerUse.depsReady') : t('settings.computerUse.depsNotReady')}
            />
          </div>

          {/* macOS Permissions — only shown on macOS (darwin) */}
          {envReady && status.platform === 'darwin' && (
            <>
              <StatusRow
                label={t('settings.computerUse.accessibility')}
                ok={status.permissions.accessibility}
                detail={
                  status.permissions.accessibility === null
                    ? t('settings.computerUse.permUnknown')
                    : status.permissions.accessibility
                      ? t('settings.computerUse.permGranted')
                      : t('settings.computerUse.permDenied')
                }
              />
              <StatusRow
                label={t('settings.computerUse.screenRecording')}
                ok={status.permissions.screenRecording}
                detail={
                  status.permissions.screenRecording === true
                    ? t('settings.computerUse.permGranted')
                    : status.permissions.screenRecording === false
                      ? t('settings.computerUse.permDenied')
                      : t('settings.computerUse.permUnknown')
                }
              />
              {(status.permissions.accessibility === false || status.permissions.screenRecording === false) && (
                <div className="flex flex-col gap-2 px-4 py-3 rounded-lg bg-[var(--color-warning)]/5 border border-[var(--color-warning)]/20">
                  <p className="text-xs text-[var(--color-text-tertiary)]">{t('settings.computerUse.permRestartHint')}</p>
                  <div className="flex gap-2">
                    {status.permissions.accessibility === false && (
                      <button
                        onClick={() => void computerUseApi.openSettings('Privacy_Accessibility')}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--color-text-accent)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-hover)]"
                      >
                        {t('settings.computerUse.openAccessibility')}
                      </button>
                    )}
                    {status.permissions.screenRecording === false && (
                      <button
                        onClick={() => void computerUseApi.openSettings('Privacy_ScreenCapture')}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--color-text-accent)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-hover)]"
                      >
                        {t('settings.computerUse.openScreenRecording')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {allReady && (status.platform !== 'darwin' || (status.permissions.accessibility && status.permissions.screenRecording)) && (
            <div className="px-4 py-3 rounded-lg bg-[var(--color-success)]/10 border border-[var(--color-success)]/30 text-sm text-[var(--color-success)] flex items-center gap-2">
              <VerifiedIcon />
              {t('settings.computerUse.allReady')}
            </div>
          )}

          {setupResult && (
            <div className={`rounded-lg border p-4 space-y-2 ${setupResult.success ? 'bg-[var(--color-success)]/5 border-[var(--color-success)]/30' : 'bg-[var(--color-error)]/5 border-[var(--color-error)]/30'}`}>
              <div className={`text-sm font-medium ${setupResult.success ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
                {setupResult.success ? t('settings.computerUse.setupSuccess') : t('settings.computerUse.setupFail')}
              </div>
              {setupResult.steps.map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                  <StatusIcon ok={step.ok} />
                  <span>{step.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            {!status.python.installed && (
              <button
                onClick={() => void openExternalUrl(pythonDownloadUrl)}
                className="flex items-center gap-2 px-5 py-2.5 text-[var(--color-btn-primary-fg)] text-sm font-semibold rounded-lg hover:brightness-105 transition-all"
                style={{ background: 'var(--gradient-btn-primary)', boxShadow: 'var(--shadow-button-primary)' }}
              >
                <DownloadIcon />
                {t('settings.computerUse.downloadPython')}
              </button>
            )}
            {!envReady && status.python.installed && (
              <button
                onClick={() => void handleSetup()}
                disabled={setupRunning}
                className="flex items-center gap-2 px-5 py-2.5 text-[var(--color-btn-primary-fg)] text-sm font-semibold rounded-lg hover:brightness-105 disabled:opacity-50 transition-all"
                style={{ background: 'var(--gradient-btn-primary)', boxShadow: 'var(--shadow-button-primary)' }}
              >
                {setupRunning ? <SpinnerIcon /> : <DownloadIcon />}
                {setupRunning ? t('settings.computerUse.settingUp') : t('settings.computerUse.runSetup')}
              </button>
            )}
            <button
              onClick={() => void fetchStatus()}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors"
            >
              <RefreshIcon />
              {t('settings.computerUse.recheckBtn')}
            </button>
          </div>

          {/* ─── App Authorization Section ─── */}
          {envReady && (
            <div className="space-y-4 pt-4 border-t border-[var(--color-border)]">
              <div>
                <h3 className="text-base font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                  {t('settings.computerUse.appsTitle')}
                  {appsSaved && (
                    <span className="text-xs font-normal text-[var(--color-success)] flex items-center gap-1">
                      <CheckCircleIcon className="text-[14px]" />
                      {t('settings.computerUse.appsSaved')}
                    </span>
                  )}
                </h3>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {t('settings.computerUse.appsDescription')}
                </p>
              </div>

              {/* Grant flags */}
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={clipboardAccess}
                    onChange={(e) => toggleFlag('clipboard', e.target.checked)}
                    className="rounded border-[var(--color-border)] accent-[var(--color-brand)]"
                  />
                  {t('settings.computerUse.flagClipboard')}
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={systemKeys}
                    onChange={(e) => toggleFlag('systemKeys', e.target.checked)}
                    className="rounded border-[var(--color-border)] accent-[var(--color-brand)]"
                  />
                  {t('settings.computerUse.flagSystemKeys')}
                </label>
              </div>

              {/* Search */}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2">
                  <SearchIcon className="text-[var(--color-text-tertiary)]" />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('settings.computerUse.appsSearch')}
                  className="w-full pl-9 pr-4 py-2 text-sm bg-[var(--color-surface-container-low)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-brand)]"
                />
              </div>

              {/* App list */}
              {appsLoading ? (
                <div className="py-6 flex justify-center">
                  <SpinnerIcon className="text-[var(--color-brand)]" />
                </div>
              ) : installedApps.length === 0 ? (
                <div className="py-6 text-center text-sm text-[var(--color-text-tertiary)]">
                  {t('settings.computerUse.appsEmpty')}
                </div>
              ) : (
                <div className="max-h-[400px] overflow-y-auto rounded-lg border border-[var(--color-border)]">
                  {sortedApps.map((app) => {
                    const isAuthorized = authorizedBundleIds.has(app.bundleId);
                    return (
                      <button
                        key={app.bundleId}
                        onClick={() => toggleApp(app)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-hover)] border-b border-[var(--color-border)] last:border-b-0 ${
                          isAuthorized ? 'bg-[var(--color-brand)]/5' : ''
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border ${
                            isAuthorized
                              ? 'bg-[var(--color-brand)] border-[var(--color-brand)]'
                              : 'border-[var(--color-border)]'
                          }`}
                        >
                          {isAuthorized && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                            {app.displayName}
                          </div>
                          <div className="text-[11px] text-[var(--color-text-tertiary)] truncate font-mono">
                            {app.bundleId}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
