import { basename } from 'node:path';

import type { OptimizerVoidResult } from '@midnite/studio-shared';

import { descendantsOf, foregroundOf, type ProcessRow } from '../agent-process';
import { foreignSessionTree, type BrokerInventory } from './broker-inventory';

/**
 * Free RAM (Phase 148 Theme C): end what is only costing memory, behind one confirm, and say how much
 * that really freed.
 *
 * **What it ends, and what it never does.** Previous-build sessions (a legacy broker's ptys), lost brokers
 * (Theme B's inventory: previous-build or unreachable), hidden browser tabs and renderer caches. It does
 * **not** end idle sessions of the current build, nor the primary broker, nor anything another app owns.
 *
 * **No new kill path.** Sessions end through the terminal service's `endSessions` (owner-filtered, routes
 * to the owning broker); brokers through Theme B's `killTree` (primary refusal, inventory membership,
 * PID-reuse argv check, foreign-session refusal). This file only decides *which* candidates to offer and
 * measures the result. The renderer sends candidate ids, never pids: execution re-derives the plan from a
 * fresh `ps` snapshot and drops any id the plan no longer contains.
 *
 * **Measurement is never an estimate.** Σ RSS of Midnite-owned processes before and after (two snapshots
 * taken by `deps.snapshotRss`), reported as `max(0, before - after)`, beside the machine's free+inactive
 * delta. A run that freed nothing says zero.
 */

export type FreeRamCandidate = {
  id: string;
  kind: 'previous-build-session' | 'lost-broker' | 'hidden-tab' | 'renderer-cache';
  label: string;
  command: string | null;
  rssBytes: number | null;
  destructive: boolean;
};

export type FreeRamPlan = { candidates: FreeRamCandidate[]; totalRssBytes: number };

export type FreeRamOutcome = {
  ended: string[];
  measured: {
    beforeRssBytes: number;
    afterRssBytes: number;
    freedRssBytes: number;
    machineFreeDeltaBytes: number | null;
  };
  failures: { id: string; message: string }[];
};

/** A pty the connected brokers hold, as `liveBrokerSessions()` reports it. */
export type FreeRamBrokerSession = {
  sessionId: string;
  pid: number;
  cwd: string;
  legacy: boolean;
  owner?: string | null;
};

export type FreeRamDeps = {
  readRows: () => Promise<ProcessRow[] | null>;
  readInventory: (rows: readonly ProcessRow[]) => Promise<BrokerInventory>;
  /** The pids no kill may touch as a broker (Theme B's `primaryBrokerPids`). */
  primaryPids: (inventory: BrokerInventory) => ReadonlySet<number>;
  brokerSessions: () => readonly FreeRamBrokerSession[];
  hiddenTabs: () => readonly { tabId: string; label: string; pid: number | null }[];
  endSessions: (sessionIds: readonly string[]) => Promise<string[]>;
  killTree: (pid: number, expectArgv: string) => Promise<OptimizerVoidResult>;
  discardTab: (tabId: string) => void;
  clearRendererCaches: () => Promise<void>;
  /** Σ RSS of Midnite-owned processes from a fresh `ps` snapshot; `null` when it could not be read. */
  snapshotRss: () => Promise<number | null>;
  /** vm_stat free+inactive bytes; `null` when unreadable. */
  freeBytes: () => Promise<number | null>;
  sleep: (ms: number) => Promise<void>;
};

const SETTLE_STEP_MS = 250;
/** 20 x 250 ms: the spec's "at most 5 s" for ended pids to leave the process table. */
const SETTLE_STEPS = 20;

const SESSION_PREFIX = 'session:';
const TAB_PREFIX = 'tab:';
export const CACHE_ID = 'cache:renderer';

const treeRss = (rows: readonly ProcessRow[], root: ProcessRow): number =>
  root.rssBytes + descendantsOf(rows, root.pid).reduce((sum, d) => sum + d.row.rssBytes, 0);

const treePids = (rows: readonly ProcessRow[], root: number): Set<number> =>
  new Set([root, ...descendantsOf(rows, root).map((d) => d.row.pid)]);

type Gathered = {
  plan: FreeRamPlan;
  /** The pty root pid each session candidate id ends. */
  sessionPids: Map<string, number>;
  /** The pid and argv each broker candidate id is ended with. */
  brokerTargets: Map<string, { pid: number; argv: string }>;
};

/**
 * Build the plan from a fresh snapshot. Throws when `ps` cannot be read: with no process table nothing can
 * be guarded, so nothing is offered.
 */
async function gather(deps: FreeRamDeps): Promise<Gathered> {
  const rows = await deps.readRows();
  if (!rows) throw new Error('Could not read the process table.');
  const inventory = await deps.readInventory(rows);
  const primaries = deps.primaryPids(inventory);
  const byPid = new Map(rows.map((r) => [r.pid, r]));
  const foreign = foreignSessionTree(rows, inventory, descendantsOf);

  // Everything under a primary broker is current-build and off limits, whatever a flag says.
  const underPrimary = new Set<number>();
  for (const pid of primaries) for (const p of treePids(rows, pid)) underPrimary.add(p);

  const candidates: FreeRamCandidate[] = [];
  const sessionPids = new Map<string, number>();
  const brokerTargets = new Map<string, { pid: number; argv: string }>();
  const sessionTreePids = new Set<number>();

  for (const s of deps.brokerSessions()) {
    if (!s.legacy) continue;
    if (s.owner && s.owner !== 'studio') continue;
    if (underPrimary.has(s.pid) || foreign.has(s.pid)) continue;
    const root = byPid.get(s.pid);
    if (!root) continue;
    const fg = foregroundOf(rows, root.pid);
    for (const p of treePids(rows, root.pid)) sessionTreePids.add(p);
    const id = `${SESSION_PREFIX}${s.sessionId}`;
    sessionPids.set(id, root.pid);
    candidates.push({
      id,
      kind: 'previous-build-session',
      label: `${basename(s.cwd) || s.cwd} · previous-build session`,
      command: (fg ?? root).args,
      rssBytes: treeRss(rows, root),
      destructive: true,
    });
  }

  for (const b of inventory.brokers) {
    if (b.primary || primaries.has(b.pid) || b.lost === null) continue;
    const root = byPid.get(b.pid);
    if (!root) continue;
    const tree = treePids(rows, b.pid);
    if ([...tree].some((p) => foreign.has(p) || underPrimary.has(p))) continue;
    // The sessions listed above sit inside this tree; count them once.
    const inSessions = [...tree].reduce(
      (sum, p) => sum + (sessionTreePids.has(p) ? (byPid.get(p)?.rssBytes ?? 0) : 0),
      0,
    );
    const id = `broker:${b.pid}`;
    brokerTargets.set(id, { pid: b.pid, argv: root.args });
    candidates.push({
      id,
      kind: 'lost-broker',
      label: `Terminal broker ${b.pid} (${b.lost === 'unreachable' ? 'unreachable' : 'previous build'})`,
      command: root.args,
      rssBytes: Math.max(0, treeRss(rows, root) - inSessions),
      destructive: true,
    });
  }

  const hidden = deps.hiddenTabs();
  const pidUses = new Map<number, number>();
  for (const t of hidden) if (t.pid !== null) pidUses.set(t.pid, (pidUses.get(t.pid) ?? 0) + 1);
  for (const t of hidden) {
    // A renderer process shared by several tabs cannot be attributed to one of them.
    const exclusive = t.pid !== null && pidUses.get(t.pid) === 1;
    candidates.push({
      id: `${TAB_PREFIX}${t.tabId}`,
      kind: 'hidden-tab',
      label: t.label,
      command: null,
      rssBytes: exclusive ? (byPid.get(t.pid as number)?.rssBytes ?? null) : null,
      destructive: false,
    });
  }

  candidates.push({
    id: CACHE_ID,
    kind: 'renderer-cache',
    label: 'Renderer and HTTP caches',
    command: null,
    rssBytes: null,
    destructive: false,
  });

  const totalRssBytes = candidates.reduce((sum, c) => sum + (c.rssBytes ?? 0), 0);
  return { plan: { candidates, totalRssBytes }, sessionPids, brokerTargets };
}

/** The dry run: what Free RAM would end or discard. Signals nothing. */
export async function planFreeRam(deps: FreeRamDeps): Promise<FreeRamPlan> {
  return (await gather(deps)).plan;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Execute the confirmed candidates. Order: sessions, brokers, tabs, caches; a failure in one step is
 * recorded and the rest still run. Then wait (bounded) for the pids it ended to leave `ps`, and measure.
 */
export async function runFreeRam(deps: FreeRamDeps, candidateIds: readonly string[]): Promise<FreeRamOutcome> {
  const gathered = await gather(deps);
  const offered = new Map(gathered.plan.candidates.map((c) => [c.id, c]));
  const failures: { id: string; message: string }[] = [];
  const ended: string[] = [];
  const chosen: FreeRamCandidate[] = [];
  for (const id of new Set(candidateIds)) {
    const c = offered.get(id);
    if (c) chosen.push(c);
    else failures.push({ id, message: 'No longer available to free.' });
  }

  const beforeRss = (await deps.snapshotRss()) ?? 0;
  const freeBefore = await deps.freeBytes();
  const gone: number[] = [];

  const sessions = chosen.filter((c) => c.kind === 'previous-build-session');
  if (sessions.length > 0) {
    try {
      const endedIds = new Set(await deps.endSessions(sessions.map((c) => c.id.slice(SESSION_PREFIX.length))));
      for (const c of sessions) {
        if (endedIds.has(c.id.slice(SESSION_PREFIX.length))) {
          ended.push(c.id);
          const pid = gathered.sessionPids.get(c.id);
          if (pid !== undefined) gone.push(pid);
        } else {
          failures.push({ id: c.id, message: 'The session was not ended.' });
        }
      }
    } catch (error) {
      for (const c of sessions) failures.push({ id: c.id, message: messageOf(error) });
    }
  }

  for (const c of chosen.filter((x) => x.kind === 'lost-broker')) {
    const target = gathered.brokerTargets.get(c.id);
    if (!target) continue;
    try {
      // Ending its last session may already have shut the broker down; that is the outcome asked for.
      const rows = await deps.readRows();
      if (rows && !rows.some((r) => r.pid === target.pid)) {
        ended.push(c.id);
        continue;
      }
      const result = await deps.killTree(target.pid, target.argv);
      if (result.ok) {
        ended.push(c.id);
        gone.push(target.pid);
      } else {
        failures.push({ id: c.id, message: result.message });
      }
    } catch (error) {
      failures.push({ id: c.id, message: messageOf(error) });
    }
  }

  const tabs = chosen.filter((c) => c.kind === 'hidden-tab');
  if (tabs.length > 0) {
    const stillHidden = new Set(deps.hiddenTabs().map((t) => `${TAB_PREFIX}${t.tabId}`));
    for (const c of tabs) {
      if (!stillHidden.has(c.id)) {
        failures.push({ id: c.id, message: 'The tab is visible again.' });
        continue;
      }
      try {
        deps.discardTab(c.id.slice(TAB_PREFIX.length));
        ended.push(c.id);
      } catch (error) {
        failures.push({ id: c.id, message: messageOf(error) });
      }
    }
  }

  if (chosen.some((c) => c.id === CACHE_ID)) {
    try {
      await deps.clearRendererCaches();
      ended.push(CACHE_ID);
    } catch (error) {
      failures.push({ id: CACHE_ID, message: messageOf(error) });
    }
  }

  for (let step = 0; step < SETTLE_STEPS && gone.length > 0; step += 1) {
    const rows = await deps.readRows();
    if (!rows || !gone.some((pid) => rows.some((r) => r.pid === pid))) break;
    await deps.sleep(SETTLE_STEP_MS);
  }

  const afterRss = (await deps.snapshotRss()) ?? beforeRss;
  const freeAfter = await deps.freeBytes();
  return {
    ended,
    measured: {
      beforeRssBytes: beforeRss,
      afterRssBytes: afterRss,
      freedRssBytes: Math.max(0, beforeRss - afterRss),
      machineFreeDeltaBytes: freeBefore === null || freeAfter === null ? null : Math.round(freeAfter - freeBefore),
    },
    failures,
  };
}
