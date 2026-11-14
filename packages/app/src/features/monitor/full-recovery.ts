import { recoverDetachedSessions } from '@midnite/studio-feature-terminal/renderer';
import type { FrameDialogs } from '@midnite/studio-frame';
import type { DetachedSessionSchema } from '@midnite/studio-shared';
import { create } from 'zustand';
import type { z } from 'zod';

import { bridge } from '../../services/bridge';
import { useUiStore } from '../../store/ui-store';
import { revealSession } from '../terminal/reveal-session';

export type RecoveredSession = z.infer<typeof DetachedSessionSchema>;

/** A broker the inventory (Phase 148 Theme B) classed `unreachable` (the broker itself, not its children). */
export type UnreachableProcess = { pid: number; name: string; rssBytes: number };

export type RecoverySummary = {
  recovered: readonly RecoveredSession[];
  /** Every pty the connected brokers hold after recovery. */
  live: number;
  previousBuild: number;
  unreachable: readonly UnreachableProcess[];
};

type Dialogs = Pick<FrameDialogs, 'notify'>;
/** What the dialog host lends the widget: enough for Full recovery's notify and Clean system's confirm. */
export type WidgetDialogs = Pick<FrameDialogs, 'confirm' | 'notify'>;

/**
 * Rows Theme B's inventory marks `lost: 'unreachable'`. Before B lands the field does not exist on the
 * wire, so this finds none and the summary's section stays hidden. Never throws: the process table is
 * an extra, not a reason to lose the recovery result.
 */
export async function readUnreachable(): Promise<UnreachableProcess[]> {
  try {
    const result = await bridge()?.optimizer.processes();
    if (!result?.ok) return [];
    // B stamps `lost` on a broker and every descendant; only the broker root (`brokerPid === pid`) is one
    // thing this build cannot attach to, so only roots are counted.
    return result.value.processes
      .filter((row) => {
        const r = row as { lost?: string | null; brokerPid?: number | null };
        return r.lost === 'unreachable' && r.brokerPid === row.pid;
      })
      .map((row) => ({ pid: row.pid, name: row.name, rssBytes: row.rssBytes ?? 0 }));
  } catch {
    return [];
  }
}

/** Group recovered sessions by `repoId`, keeping the order each repo first appears in. */
export function groupByRepo(
  sessions: readonly RecoveredSession[],
): { repoId: string; sessions: RecoveredSession[] }[] {
  const groups = new Map<string, RecoveredSession[]>();
  for (const session of sessions) {
    const bucket = groups.get(session.repoId);
    if (bucket) bucket.push(session);
    else groups.set(session.repoId, [session]);
  }
  return [...groups].map(([repoId, list]) => ({ repoId, sessions: list }));
}

/**
 * `staleCount` is the renderer's live `previousBuildSessions().length`, the same list the dialog's section
 * renders, so "Everything is attached" and that section can never disagree.
 */
export const isAllAttached = (s: RecoverySummary, staleCount: number): boolean =>
  s.recovered.length === 0 && staleCount === 0 && s.unreachable.length === 0;

type FullRecoveryState = {
  summary: RecoverySummary | null;
  /** The host's dialogs, so the widget (which has none of its own) runs the same flow as the palette. */
  dialogs: WidgetDialogs | null;
  open: (summary: RecoverySummary) => void;
  close: () => void;
  setDialogs: (dialogs: WidgetDialogs | null) => void;
};

export const useFullRecoveryStore = create<FullRecoveryState>((set) => ({
  summary: null,
  dialogs: null,
  open: (summary) => set({ summary }),
  close: () => set({ summary: null }),
  setDialogs: (dialogs) => set({ dialogs }),
}));

/**
 * Full recovery: #1259's recovery (re-adopt every detached session and rebuild its row), a re-read of the
 * session list, then one summary dialog. The palette's `terminal.recoverDetached` and the monitor flyout's
 * Full recovery button both run this. An error envelope shows a notify and no dialog.
 */
let inFlight: Promise<RecoverySummary | null> | null = null;

export function runFullRecovery(dialogs?: Dialogs): Promise<RecoverySummary | null> {
  // A double click joins the run in progress instead of starting a second one.
  inFlight ??= runOnce(dialogs).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runOnce(dialogs?: Dialogs): Promise<RecoverySummary | null> {
  // No toast of its own: the summary dialog is the report.
  const result = await recoverDetachedSessions(dialogs, { silent: true });
  if (!result || !result.ok) return null;
  const summary: RecoverySummary = {
    recovered: result.recovered,
    live: result.live,
    previousBuild: result.previousBuild,
    unreachable: await readUnreachable(),
  };
  useFullRecoveryStore.getState().open(summary);
  return summary;
}

/** The flyout's seam: runs the flow with the host's dialogs, a no-op before the host has mounted. */
export function runFullRecoveryFromWidget(): void {
  const dialogs = useFullRecoveryStore.getState().dialogs;
  if (!dialogs) return;
  runFullRecovery(dialogs).catch((error: unknown) =>
    dialogs.notify({
      title: 'Could not recover sessions',
      body: error instanceof Error ? error.message : String(error),
    }),
  );
}

/** Reveal = focus the session's row and select its repo. Resolves false when the row is gone. */
export function revealRecovered(session: RecoveredSession): boolean {
  // Focus the row first: a row that is gone must not leave the user on a different repo.
  if (!revealSession(session.sessionId)) return false;
  useUiStore.getState().selectRepo(session.repoId);
  return true;
}
