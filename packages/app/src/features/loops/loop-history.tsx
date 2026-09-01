import type { LoopRunRecord } from '@midnite/studio-shared';
import { useState } from 'react';
import { LuChevronDown, LuChevronRight } from 'react-icons/lu';

/**
 * One loop's past runs, collapsed by default.
 *
 * Collapsed, because the terminal below it is the point of the tab and a
 * narrow docked panel has no height to spare — but the summary count is
 * always on screen, so the history is discoverable without costing a row per
 * run. Expanding a row shows the exact composed prompt: the record of which
 * toggles that run actually carried, which is the whole reason the ledger
 * stores the composed line rather than the modifier ids alone.
 */
export function LoopHistory({ runs }: { runs: LoopRunRecord[] }) {
  const [open, setOpen] = useState(false);
  // Newest first — the ledger appends, and the interesting run is the last one.
  const ordered = [...runs].sort((a, b) => b.startedAt - a.startedAt);

  return (
    <div className="shrink-0 border-b border-border" data-testid="loop-history">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? (
          <LuChevronDown aria-hidden className="h-3 w-3" />
        ) : (
          <LuChevronRight aria-hidden className="h-3 w-3" />
        )}
        History ({ordered.length})
      </button>
      {open ? (
        <div className="max-h-32 overflow-y-auto px-2 pb-2">
          {ordered.length === 0 ? (
            <p className="py-1 text-[11px] text-muted-foreground">No runs yet.</p>
          ) : (
            ordered.map((run) => <HistoryRow key={run.id} run={run} />)
          )}
        </div>
      ) : null}
    </div>
  );
}

function HistoryRow({ run }: { run: LoopRunRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border/50 py-1 first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className={`shrink-0 ${STATUS_COLOR[run.status]}`}>●</span>
        <span className="shrink-0 font-mono">{clock(run.startedAt)}</span>
        <span className="shrink-0">{duration(run)}</span>
        <span className="min-w-0 flex-1 truncate text-right">{outcome(run)}</span>
      </button>
      {open ? (
        <p className="mt-1 break-words rounded bg-muted/50 p-1.5 font-mono text-[10px] text-muted-foreground">
          {run.composedPrompt}
        </p>
      ) : null}
    </div>
  );
}

const STATUS_COLOR: Record<LoopRunRecord['status'], string> = {
  running: 'text-green-500',
  stopped: 'text-muted-foreground',
  exited: 'text-blue-500',
};

function clock(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Elapsed for a finished run; a live one has no duration to state yet. */
function duration(run: LoopRunRecord): string {
  if (run.endedAt === undefined) return '';
  const seconds = Math.max(0, Math.round((run.endedAt - run.startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`;
}

function outcome(run: LoopRunRecord): string {
  if (run.status === 'running') return 'running';
  if (run.status === 'stopped') return 'stopped';
  return run.exitCode === undefined ? 'exited' : `exit ${run.exitCode}`;
}
