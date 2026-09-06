import { useEffect, useMemo, useState } from 'react';
import {
  LuArrowDown,
  LuArrowUp,
  LuChevronsUpDown,
  LuRefreshCw,
  LuSearch,
  LuSquareTerminal,
  LuTrash2,
  LuX,
} from 'react-icons/lu';

import type { ProcessInfo } from '@midnite/studio-shared';

import { ConfirmDialog, type ConfirmRequest } from '../../components/confirm-dialog';
import { IconButton } from '../../components/icon-button';
import { formatBytes } from '../monitor/format-bytes';
import { CircularGauge } from './components/circular-gauge';
import { OptimizerMetrics } from './components/optimizer-metrics';
import { useOptimizerStore } from '../../store/optimizer-store';
import { killOptimizerProcess, loadOptimizerProcesses } from './use-optimizer';

const POLL_INTERVAL_MS = 5_000;

/**
 * The process table's sort axes.
 *
 * `type` sorts on `ours` rather than on the rendered word: the column shows a
 * badge, not text, and sorting a badge column by the string inside it would
 * break the moment the badge's wording changed. Ascending puts the Agent rows
 * (the ones you can actually terminate) first, which is the ordering someone
 * clicking that header is looking for.
 */
type SortKey = 'name' | 'pid' | 'type' | 'cpu' | 'rss';
type SortDir = 'asc' | 'desc';
type Sort = { key: SortKey; dir: SortDir };

/** Numeric columns start big-first; text columns start A-first. */
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: 'asc',
  pid: 'asc',
  type: 'asc',
  cpu: 'desc',
  rss: 'desc',
};

/**
 * Compare on the chosen key, then always on `pid`.
 *
 * The tie-break is not cosmetic: the table re-renders every 5s off a fresh
 * `ps` read, and two processes at 0.0% CPU with no stable secondary key swap
 * places between polls — a row that jumps under the pointer as you reach for
 * its Terminate button.
 */
function compareProcesses(a: ProcessInfo, b: ProcessInfo, sort: Sort): number {
  const sign = sort.dir === 'asc' ? 1 : -1;
  let primary = 0;
  switch (sort.key) {
    case 'name':
      primary = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      break;
    case 'pid':
      primary = a.pid - b.pid;
      break;
    case 'type':
      primary = Number(b.ours) - Number(a.ours);
      break;
    case 'cpu':
      primary = a.cpuPercent - b.cpuPercent;
      break;
    case 'rss':
      primary = a.rssBytes - b.rssBytes;
      break;
  }
  return primary !== 0 ? primary * sign : a.pid - b.pid;
}

/** A sortable column header — the whole cell is the button, so the hit target
 *  is the header rather than the four characters of its label. */
function SortHeader({
  label,
  columnKey,
  sort,
  onSort,
  align = 'left',
}: {
  label: string;
  columnKey: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = sort.key === columnKey;
  const Icon = !active ? LuChevronsUpDown : sort.dir === 'asc' ? LuArrowUp : LuArrowDown;
  return (
    <th
      scope="col"
      className={`p-0 ${align === 'right' ? 'text-right' : 'text-left'}`}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className={`flex w-full items-center gap-1 px-3 py-2 text-[11px] font-medium uppercase tracking-wide transition-colors hover:text-foreground ${
          align === 'right' ? 'justify-end' : ''
        } ${active ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        {label}
        <Icon aria-hidden className={`h-3 w-3 shrink-0 ${active ? '' : 'opacity-40'}`} />
      </button>
    </th>
  );
}

export function MemoryTab() {
  const processes = useOptimizerStore((s) => s.processes);
  const memory = useOptimizerStore((s) => s.memory);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>({ key: 'rss', dir: 'desc' });
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
    const matched = !q
      ? processes
      : processes.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.argv.toLowerCase().includes(q) ||
            String(p.pid).includes(q),
        );
    return [...matched].sort((a, b) => compareProcesses(a, b, sort));
  }, [processes, query, sort]);

  // Clicking the active column flips it; clicking another starts that column
  // at its own natural direction rather than inheriting the last one's.
  const handleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: DEFAULT_DIR[key] },
    );

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
      {/*
        The system monitor's CPU and RAM lines, over the Optimizer's own
        15-minute window — the gauges below are this instant, and a gauge
        cannot tell you the machine was pinned while your build ran.
      */}
      {/*
        Compact: two full-height charts would push the process table — the
        thing this tab is for — below the fold on a 800px window.
      */}
      <OptimizerMetrics metrics={['cpu', 'memory']} compact title="CPU & RAM" />

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
                <SortHeader label="Process" columnKey="name" sort={sort} onSort={handleSort} />
                <SortHeader label="PID" columnKey="pid" sort={sort} onSort={handleSort} align="right" />
                <SortHeader label="Type" columnKey="type" sort={sort} onSort={handleSort} />
                <SortHeader label="CPU" columnKey="cpu" sort={sort} onSort={handleSort} align="right" />
                <SortHeader label="Memory" columnKey="rss" sort={sort} onSort={handleSort} align="right" />
                <th scope="col" className="px-4 py-2 text-right">
                  Action
                </th>
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
                            className={`optimizer-terminate group/term inline-flex cursor-pointer items-center rounded-md border px-2 py-1 text-[11px] font-medium ${
                              isSentSigterm ? 'optimizer-terminate--armed' : ''
                            }`}
                          >
                            {/*
                              The icon is a width transition, not a
                              `display` swap: a trash can that pops into
                              existence shoves the label sideways in one
                              frame, and the whole point of showing it on
                              hover is that the row stays calm while the
                              button becomes unmistakably destructive.
                            */}
                            <span
                              aria-hidden
                              className="inline-flex w-0 -translate-x-1 overflow-hidden opacity-0 transition-all duration-150 group-hover/term:mr-1 group-hover/term:w-3 group-hover/term:translate-x-0 group-hover/term:opacity-100 group-focus-visible/term:mr-1 group-focus-visible/term:w-3 group-focus-visible/term:translate-x-0 group-focus-visible/term:opacity-100"
                            >
                              <LuTrash2 className="h-3 w-3 shrink-0" />
                            </span>
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
