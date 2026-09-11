import { useEffect, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import type { WindowDescriptor } from '@midnite/studio-shared';

import { Popover } from '../../components/popover';
import { bridge } from '../../services/bridge';
import { invalidateForWatchKind } from '../../services/watch-invalidation';
import { computeLivenessStatus, type LivenessDotState, useLivenessStore } from '../../store/liveness-store';
import { useGraphStore } from '../graph/graph-store';
import { useUiStore } from '../../store/ui-store';

const DOT_CLASS: Record<LivenessDotState, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-destructive',
};

const DOT_LABEL: Record<LivenessDotState, string> = {
  green: 'Live',
  amber: 'Connecting',
  red: 'Watcher error',
};

/** `listWindows()`'s live view, the same poll-once-then-push shape `use-window-sync.ts` uses. */
function useWindowList(): WindowDescriptor[] {
  const [windows, setWindows] = useState<WindowDescriptor[]>([]);

  useEffect(() => {
    const api = bridge();
    if (!api) return undefined;
    let alive = true;
    api.window.list().then((list) => {
      if (alive) setWindows(list);
    });
    const unsubscribe = api.window.onWindowsChanged((e) => setWindows(e.windows));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  return windows;
}

/**
 * The status-bar liveness dot (Phase 84 Theme I) — green/amber/red for
 * whether THIS window can currently see live updates, backed by
 * `liveness-store.ts`. Rendered both as a main-window status-bar segment
 * (`segments.ts`) and directly inside `DetachedWindowFrame` for every
 * popout, since popouts have no `<StatusBar>` of their own to register into.
 *
 * The popover doubles as Theme D.3's per-window diagnostics row — there is
 * no separate "window diagnostics panel" elsewhere in the app, so this is
 * where that data actually surfaces. Every window's role and repo come from
 * `listWindows()`, honest since Theme D.1; only THIS window's own last-sync
 * time is real today; a smaller phase would have to wire cross-window
 * aggregation in main for the other rows to say more than "—".
 */
export function LivenessSegment() {
  const [open, setOpen] = useState(false);
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const lastWatchAt = useLivenessStore((s) => s.lastWatchAt);
  const watcherError = useLivenessStore((s) => s.watcherError);
  const fetchStatus = useLivenessStore((s) => s.fetchStatus);
  const forgeStatus = useLivenessStore((s) => s.forgeStatus);
  const status = computeLivenessStatus(
    { lastWatchAt, watcherError, fetchStatus, forgeStatus },
    selectedRepoId !== null,
  );
  const windows = useWindowList();
  const thisRole = bridge()?.windowRole ?? null;
  const queryClient = useQueryClient();

  const runRefresh = (): void => {
    if (selectedRepoId === null) return;
    const { restreamGraph } = invalidateForWatchKind(queryClient, selectedRepoId, 'head');
    if (restreamGraph) useGraphStore.getState().requestRestream();
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="top"
      align="end"
      label={`Live sync: ${DOT_LABEL[status.state]}`}
      testId="liveness-segment"
      trigger={
        <span
          data-testid="liveness-dot"
          data-sync-state={status.state}
          className="flex items-center gap-1.5"
        >
          <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[status.state]}`} />
          <span className="status-label text-muted-foreground">{status.reason}</span>
        </span>
      }
    >
      <div className="w-[340px] max-w-[calc(100vw-1rem)]">
        <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Live sync
          </h2>
          <button
            type="button"
            onClick={runRefresh}
            disabled={selectedRepoId === null}
            className="rounded px-1.5 py-0.5 text-[11px] transition-colors hover:bg-accent disabled:opacity-50"
          >
            Refresh now
          </button>
        </header>

        <p className="px-3 py-2 text-xs text-muted-foreground">{status.reason}</p>

        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-muted-foreground">
              <th className="px-3 py-1 text-left font-medium">Window</th>
              <th className="px-3 py-1 text-left font-medium">Repo</th>
              <th className="px-3 py-1 text-left font-medium">Last sync</th>
            </tr>
          </thead>
          <tbody>
            {windows.map((win) => (
              <tr key={win.id} className="border-t border-border">
                <td className="px-3 py-1">
                  {win.role}
                  {win.role === thisRole ? ' (this window)' : ''}
                </td>
                <td className="px-3 py-1">{win.repoId ?? '—'}</td>
                <td className="px-3 py-1">
                  {win.role === thisRole
                    ? (lastWatchAt === null ? '—' : status.reason.replace('Synced ', ''))
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Popover>
  );
}
