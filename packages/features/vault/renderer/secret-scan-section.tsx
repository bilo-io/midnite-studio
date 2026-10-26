import { bridge } from '@midnite/studio-frame';
import type { SecretFinding } from '@midnite/studio-shared';
import { useCallback, useEffect, useState } from 'react';
import {
  LuClipboardCheck,
  LuFileText,
  LuRefreshCw,
  LuSearch,
  LuShieldAlert,
  LuShieldCheck,
} from 'react-icons/lu';

export function SecretScanSection() {
  const [repoPath, setRepoPath] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanReport, setScanReport] = useState<{
    scannedCommits: number;
    findings: SecretFinding[];
    advice: string;
  } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const [hookInstalled, setHookInstalled] = useState<boolean | null>(null);
  const [hookBusy, setHookBusy] = useState(false);

  const [clipboardWatchOn, setClipboardWatchOn] = useState(false);

  const checkHook = useCallback(async () => {
    if (!repoPath.trim()) return;
    const api = bridge()?.vaultScan;
    if (!api) return;
    try {
      const res = await api.hookStatus({ repoPath: repoPath.trim() });
      setHookInstalled(res.installed);
    } catch {
      setHookInstalled(false);
    }
  }, [repoPath]);

  useEffect(() => {
    if (repoPath.trim()) {
      void checkHook();
    } else {
      setHookInstalled(null);
    }
  }, [repoPath, checkHook]);

  const handleScanHistory = async () => {
    if (!repoPath.trim()) return;
    const api = bridge()?.vaultScan;
    if (!api) return;

    setScanning(true);
    setScanError(null);
    setScanReport(null);

    try {
      const res = await api.history({ repoPath: repoPath.trim(), maxCommits: 200 });
      if (res.ok) {
        setScanReport({
          scannedCommits: res.scannedCommits,
          findings: res.findings,
          advice: res.advice,
        });
      } else {
        setScanError(res.error ?? 'History scan failed');
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  };

  const handleToggleHook = async () => {
    if (!repoPath.trim() || hookBusy) return;
    const api = bridge()?.vaultScan;
    if (!api) return;

    setHookBusy(true);
    try {
      if (hookInstalled) {
        await api.hookUninstall({ repoPath: repoPath.trim() });
      } else {
        await api.hookInstall({ repoPath: repoPath.trim() });
      }
      await checkHook();
    } catch {
      // Ignore
    } finally {
      setHookBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Secret Scanning</h2>
          <p className="text-xs text-muted-foreground">
            Scans commits and clipboard to prevent accidental secret leaks.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 pt-2">
        {/* Repo History Scan */}
        <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-background/50 p-3">
          <span className="text-xs font-medium text-foreground">Repository History Scan</span>
          <p className="text-[11px] text-muted-foreground">
            Walks commit history through the high-entropy and credential pattern scanner. Never rewrites history.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              placeholder="/path/to/repository"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              className="flex-1 rounded border border-border bg-background px-2.5 py-1 text-xs"
            />
            <button
              type="button"
              onClick={() => void handleScanHistory()}
              disabled={scanning || !repoPath.trim()}
              data-testid="scan-history-button"
              className="inline-flex items-center gap-1.5 rounded border border-border bg-background px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              {scanning ? <LuRefreshCw className="size-3 animate-spin" /> : <LuSearch className="size-3" />}
              {scanning ? 'Scanning...' : 'Scan history'}
            </button>
          </div>

          {scanError ? (
            <div className="rounded bg-rose-500/10 p-2 text-xs text-rose-400">
              {scanError}
            </div>
          ) : null}

          {scanReport ? (
            <div className="mt-2 space-y-2">
              {scanReport.findings.length === 0 ? (
                <div className="flex items-center gap-2 rounded bg-emerald-500/10 p-2 text-xs text-emerald-400">
                  <LuShieldCheck className="size-4 shrink-0" />
                  <span>No secrets detected across {scanReport.scannedCommits} commit{scanReport.scannedCommits === 1 ? '' : 's'}.</span>
                </div>
              ) : (
                <div className="space-y-2 rounded border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300">
                  <div className="flex items-start gap-2">
                    <LuShieldAlert className="size-4 shrink-0 text-amber-400" />
                    <div>
                      <p className="font-semibold text-amber-200">
                        {scanReport.findings.length} secret{scanReport.findings.length === 1 ? '' : 's'} detected in history
                      </p>
                      <p className="mt-0.5 text-[11px] text-amber-300/90">{scanReport.advice}</p>
                    </div>
                  </div>

                  <div className="mt-2 max-h-48 overflow-y-auto rounded border border-amber-500/20 bg-background/80 p-2">
                    <ul className="space-y-1 font-mono text-[11px]">
                      {scanReport.findings.map((f, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 border-b border-border/40 pb-1 last:border-none">
                          <span className="text-muted-foreground">
                            {f.commit ? f.commit.slice(0, 7) : 'commit'}: {f.file ? `${f.file}:${f.line}` : `line ${f.line}`}
                          </span>
                          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300 font-sans">
                            {f.pattern}
                          </span>
                          <span className="text-foreground">{f.masked}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Pre-commit Hook */}
        <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/50 p-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <LuFileText className="size-3.5 text-muted-foreground" />
              <span>Pre-commit Git Hook</span>
              {hookInstalled === true ? (
                <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">Installed</span>
              ) : hookInstalled === false ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Not installed</span>
              ) : null}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Optional pre-commit scan for commits made outside Studio (e.g. in your terminal).
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleToggleHook()}
            disabled={hookBusy || !repoPath.trim()}
            className="inline-flex items-center gap-1 rounded border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50"
          >
            {hookInstalled ? 'Uninstall hook' : 'Install hook'}
          </button>
        </div>

        {/* Clipboard Watch */}
        <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/50 p-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <LuClipboardCheck className="size-3.5 text-muted-foreground" />
              <span>Clipboard Secret Watch</span>
              {clipboardWatchOn ? (
                <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">Active</span>
              ) : (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Off</span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Polls clipboard hash at &le; 1 Hz and alerts if a secret token or vault value is copied.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setClipboardWatchOn(!clipboardWatchOn)}
              className={`rounded px-2.5 py-1 text-xs font-medium border ${
                clipboardWatchOn
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              {clipboardWatchOn ? 'Enabled' : 'Enable'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
