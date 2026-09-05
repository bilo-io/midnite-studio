import { useEffect, useMemo, useState } from 'react';
import { LuRefreshCw, LuSearch, LuSquareTerminal, LuX } from 'react-icons/lu';

import type { ProcessInfo } from '@midnite/studio-shared';

import { ConfirmDialog, type ConfirmRequest } from '../../components/confirm-dialog';
import { IconButton } from '../../components/icon-button';
import { formatBytes } from '../monitor/format-bytes';
import { CircularGauge } from './components/circular-gauge';
import { useOptimizerStore } from '../../store/optimizer-store';
import { killOptimizerProcess, loadOptimizerProcesses } from './use-optimizer';

const POLL_INTERVAL_MS = 5_000;

export function MemoryTab() {
  const processes = useOptimizerStore((s) => s.processes);
  const memory = useOptimizerStore((s) => s.memory);

  const [query, setQuery] = useState('');
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const [sentSigtermPids, setSentSigtermPids] = useState<Set<number>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Polling lifecycle: 5s timer, paused when blurred, resumed on focus
  useEffect(() => {
    void loadOptimizerProcesses();

    let timer: NodeJS.Timeout | null = null;

    const startTimer = () => {
      if (timer !== null) clearInterval(timer);
      timer = setInterval(() => {
        void loadOptimizerProcesses();
      }, POLL_INTERVAL_MS);
    };

    const stopTimer = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onFocus = () => {
      void loadOptimizerProcesses();
      startTimer();
    };

    const onBlur = () => {
      stopTimer();
    };

    startTimer();
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);

    return () => {
      stopTimer();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadOptimizerProcesses();
    } finally {
      setIsRefreshing(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return processes;
    return processes.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.argv.toLowerCase().includes(q) ||
        String(p.pid).includes(q),
    );
  }, [processes, query]);

  const handlePromptKill = (proc: ProcessInfo) => {
    const isForce = sentSigtermPids.has(proc.pid);
    setConfirmReq({
      title: isForce ? `Force Kill Process (PID ${proc.pid})` : `Terminate Process (PID ${proc.pid})`,
      body: isForce
        ? `Send SIGKILL to force terminate ${proc.name}?`
        : `Send SIGTERM to stop ${proc.name}?`,
      confirmLabel: isForce ? 'Force Kill' : 'Terminate',
      danger: true,
      warnings: [proc.argv],
      onConfirm: async () => {
        setConfirmReq(null);
        const outcome = await killOptimizerProcess(proc.pid, proc.argv, isForce);
        if (outcome.ok && !isForce) {
          setSentSigtermPids((prev) => new Set(prev).add(proc.pid));
        }
      },
    });
  };

  const usedPercent =
    memory && memory.totalBytes > 0
      ? Math.round((memory.usedBytes / memory.totalBytes) * 100)
      : 0;
  const cachedPercent =
    memory && memory.totalBytes > 0
      ? Math.round((memory.cachedBytes / memory.totalBytes) * 100)
      : 0;
  const freePercent =
    memory && memory.totalBytes > 0
      ? Math.round((memory.freeBytes / memory.totalBytes) * 100)
      : 0;

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      {/* Top Section: Memory Breakdown */}
      {memory ? (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card/60 p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-around gap-6">
            <CircularGauge
              percent={usedPercent}
              label="Memory Used"
              detail={`${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)}`}
            />
            <CircularGauge
              percent={cachedPercent}
              label="Cached Files"
              detail={formatBytes(memory.cachedBytes)}
            />
            <CircularGauge
              percent={freePercent}
              label="Free RAM"
              detail={formatBytes(memory.freeBytes)}
            />
          </div>

          {/* 4-segment detailed memory stats */}
          <div className="grid grid-cols-2 gap-2 border-t border-border pt-4 sm:grid-cols-4 sm:gap-4">
            <div className="flex flex-col rounded-lg bg-muted/40 p-2.5 text-center">
              <span className="text-[11px] font-medium text-muted-foreground uppercase">Wired</span>
              <span className="font-mono text-xs font-semibold text-foreground">
                {formatBytes(memory.wiredBytes)}
              </span>
            </div>
            <div className="flex flex-col rounded-lg bg-muted/40 p-2.5 text-center">
              <span className="text-[11px] font-medium text-muted-foreground uppercase">Active</span>
              <span className="font-mono text-xs font-semibold text-foreground">
                {formatBytes(memory.activeBytes)}
              </span>
            </div>
            <div className="flex flex-col rounded-lg bg-muted/40 p-2.5 text-center">
              <span className="text-[11px] font-medium text-muted-foreground uppercase">Compressed</span>
              <span className="font-mono text-xs font-semibold text-foreground">
                {formatBytes(memory.compressedBytes)}
              </span>
            </div>
            <div className="flex flex-col rounded-lg bg-muted/40 p-2.5 text-center">
              <span className="text-[11px] font-medium text-muted-foreground uppercase">Cached</span>
              <span className="font-mono text-xs font-semibold text-foreground">
                {formatBytes(memory.cachedBytes)}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Process Table Section */}
      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card shadow-xs">
        {/* Table Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Processes</h3>
            <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
              {filtered.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <LuSearch className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter processes or PID…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 w-48 rounded-md border border-input bg-background pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden sm:w-64"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear filter"
                  className="absolute right-2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <LuX className="h-3 w-3" />
                </button>
              ) : null}
            </div>

            <IconButton
              icon={LuRefreshCw}
              label="Refresh processes"
              size="sm"
              onClick={handleRefresh}
              className={isRefreshing ? 'animate-spin' : ''}
            />
          </div>
        </div>

        {/* Process Table */}
        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/60 text-[11px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur-xs">
              <tr>
                <th className="px-4 py-2">Process</th>
                <th className="px-3 py-2 text-right">PID</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">CPU</th>
                <th className="px-3 py-2 text-right">Memory</th>
                <th className="px-4 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-sans">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                    {query ? 'No matching processes found.' : 'No processes reported.'}
                  </td>
                </tr>
              ) : (
                filtered.map((proc) => {
                  const isSentSigterm = sentSigtermPids.has(proc.pid);
                  return (
                    <tr
                      key={proc.pid}
                      className="transition-colors hover:bg-muted/30"
                    >
                      <td className="max-w-xs truncate px-4 py-2.5 sm:max-w-sm">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{proc.name}</span>
                          <span
                            title={proc.argv}
                            className="truncate font-mono text-[10px] text-muted-foreground"
                          >
                            {proc.argv}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[11px] text-muted-foreground">
                        {proc.pid}
                      </td>
                      <td className="px-3 py-2.5">
                        {proc.ours ? (
                          <span className="inline-flex items-center gap-1 rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            <LuSquareTerminal className="h-2.5 w-2.5" />
                            Agent
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            System
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[11px] text-muted-foreground">
                        {proc.cpuPercent.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[11px] font-medium text-foreground">
                        {formatBytes(proc.rssBytes)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {proc.ours ? (
                          <button
                            type="button"
                            onClick={() => handlePromptKill(proc)}
                            className={`cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                              isSentSigterm
                                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                                : 'border border-destructive/40 text-destructive hover:bg-destructive/10'
                            }`}
                          >
                            {isSentSigterm ? 'Force Kill' : 'Terminate'}
                          </button>
                        ) : (
                          <span
                            title="Only Midnite-spawned processes can be terminated"
                            className="inline-block cursor-not-allowed text-[11px] text-muted-foreground/50"
                          >
                            Protected
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {confirmReq ? (
        <ConfirmDialog
          request={confirmReq}
          onCancel={() => setConfirmReq(null)}
        />
      ) : null}
    </div>
  );
}
