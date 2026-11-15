import { describe, expect, it, vi } from 'vitest';

import type { ProcessRow } from '../agent-process';
import type { BrokerInventory } from './broker-inventory';
import { CACHE_ID, planFreeRam, runFreeRam, type FreeRamBrokerSession, type FreeRamDeps } from './free-ram';

/**
 * Behaviour of the Free RAM planner/executor over an in-memory process table. Nothing here signals,
 * spawns or reads a real process: `endSessions` and `killTree` are mocks that edit the table, the way an
 * exit would.
 */

const MB = 1024 * 1024;
const row = (pid: number, ppid: number, rssMb: number, args: string, stat = 'S'): ProcessRow => ({
  pid,
  ppid,
  stat,
  rssBytes: rssMb * MB,
  cpuPercent: 0,
  args,
});

const BROKER_DIR = '/u/broker';
const brokerArgv = (name: string): string => `node broker.js --socket ${BROKER_DIR}/${name}.sock`;

/**
 * Fixture: the primary broker (100) with a current-build session (101 zsh, 102 claude); an old-build
 * broker (200) holding two sessions (201 zsh + 202 vite, 203 zsh); an unreachable retired broker (300)
 * with a pty tree (301 zsh); a foreign broker (400) holding another app's session (401).
 */
function table(): ProcessRow[] {
  return [
    row(100, 1, 40, brokerArgv('primary')),
    row(101, 100, 10, '/bin/zsh', 'Ss'),
    row(102, 101, 900, 'claude', 'S+'),
    row(200, 1, 30, brokerArgv('old')),
    row(201, 200, 10, '/bin/zsh'),
    row(202, 201, 500, 'vite dev', 'S+'),
    row(203, 200, 20, '/bin/zsh'),
    row(300, 1, 25, brokerArgv('gone')),
    row(301, 300, 600, '/bin/zsh'),
    row(400, 1, 30, brokerArgv('other')),
    row(401, 400, 70, '/bin/zsh'),
    row(500, 1, 150, 'tab renderer'),
  ];
}

const inventory = (): BrokerInventory => ({
  brokers: [
    { pid: 100, socketName: 'primary.sock', argv: brokerArgv('primary'), primary: true, lost: null },
    { pid: 200, socketName: 'old.sock', argv: brokerArgv('old'), primary: false, lost: 'previous-build' },
    { pid: 300, socketName: 'gone.sock', argv: brokerArgv('gone'), primary: false, lost: 'unreachable' },
    { pid: 400, socketName: 'other.sock', argv: brokerArgv('other'), primary: false, lost: 'previous-build' },
  ],
  primaryPid: 100,
  noRowPtys: [],
  foreignSessionPids: [401],
});

const sessions = (): FreeRamBrokerSession[] => [
  { sessionId: 's-primary', pid: 101, cwd: '/r/app', legacy: false, owner: 'studio' },
  { sessionId: 's-old-1', pid: 201, cwd: '/r/app', legacy: true, owner: 'studio' },
  { sessionId: 's-old-2', pid: 203, cwd: '/r/lib', legacy: true, owner: null },
  { sessionId: 's-foreign', pid: 401, cwd: '/r/x', legacy: true, owner: 'cleaner' },
  // Claims to be legacy but sits under the primary broker: must still be refused.
  { sessionId: 's-liar', pid: 101, cwd: '/r/app', legacy: true, owner: 'studio' },
];

type Harness = {
  deps: FreeRamDeps;
  rows: { current: ProcessRow[] };
  mocks: {
    endSessions: ReturnType<typeof vi.fn>;
    killTree: ReturnType<typeof vi.fn>;
    discardTab: ReturnType<typeof vi.fn>;
    clearRendererCaches: ReturnType<typeof vi.fn>;
  };
};

/** Pids that exit when `root` does (its whole tree). */
const dropTree = (rows: ProcessRow[], root: number): ProcessRow[] => {
  const dead = new Set([root]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const r of rows) {
      if (dead.has(r.pid) || !dead.has(r.ppid)) continue;
      dead.add(r.pid);
      grew = true;
    }
  }
  return rows.filter((r) => !dead.has(r.pid));
};

function harness(overrides: Partial<FreeRamDeps> = {}): Harness {
  const rows = { current: table() };
  const hidden = [{ tabId: 't1', label: 'Docs', pid: 500 }];
  const endSessions = vi.fn(async (ids: readonly string[]) => {
    const byId = new Map(sessions().map((s) => [s.sessionId, s.pid]));
    for (const id of ids) {
      const pid = byId.get(id);
      if (pid !== undefined) rows.current = dropTree(rows.current, pid);
    }
    return [...ids];
  });
  const killTree = vi.fn(async (pid: number) => {
    rows.current = dropTree(rows.current, pid);
    return { ok: true as const };
  });
  const discardTab = vi.fn();
  const clearRendererCaches = vi.fn(async () => undefined);
  const deps: FreeRamDeps = {
    readRows: async () => rows.current.map((r) => ({ ...r })),
    readInventory: async () => inventory(),
    primaryPids: (inv) => new Set(inv.brokers.filter((b) => b.primary).map((b) => b.pid)),
    brokerSessions: () => sessions(),
    hiddenTabs: () => hidden,
    endSessions,
    killTree,
    discardTab,
    clearRendererCaches,
    snapshotRss: async () => rows.current.reduce((sum, r) => sum + r.rssBytes, 0),
    freeBytes: async () => 1000 * MB,
    sleep: async () => undefined,
    ...overrides,
  };
  return { deps, rows, mocks: { endSessions, killTree, discardTab, clearRendererCaches } };
}

describe('planFreeRam', () => {
  it('lists previous-build sessions, then lost brokers, then tabs, then caches, in that order', async () => {
    const { deps } = harness();
    const plan = await planFreeRam(deps);
    expect(plan.candidates.map((c) => c.id)).toEqual([
      'session:s-old-1',
      'session:s-old-2',
      'broker:200',
      'broker:300',
      'tab:t1',
      CACHE_ID,
    ]);
    expect(plan.candidates.map((c) => c.kind)).toEqual([
      'previous-build-session',
      'previous-build-session',
      'lost-broker',
      'lost-broker',
      'hidden-tab',
      'renderer-cache',
    ]);
  });

  it('never offers the primary broker, a current-build session, or another app’s session or broker', async () => {
    const { deps } = harness();
    const ids = (await planFreeRam(deps)).candidates.map((c) => c.id);
    expect(ids).not.toContain('broker:100');
    expect(ids).not.toContain('session:s-primary');
    expect(ids).not.toContain('session:s-liar');
    expect(ids).not.toContain('session:s-foreign');
    expect(ids).not.toContain('broker:400');
  });

  it('counts each byte once: a broker candidate excludes the sessions listed beside it', async () => {
    const { deps } = harness();
    const plan = await planFreeRam(deps);
    const byId = new Map(plan.candidates.map((c) => [c.id, c]));
    // Session 201 tree = 10 + 500; session 203 = 20; broker 200 = 30 (itself) once those are taken out.
    expect(byId.get('session:s-old-1')?.rssBytes).toBe(510 * MB);
    expect(byId.get('session:s-old-2')?.rssBytes).toBe(20 * MB);
    expect(byId.get('broker:200')?.rssBytes).toBe(30 * MB);
    // An unreachable broker's unlisted ptys count with it: 25 + 600.
    expect(byId.get('broker:300')?.rssBytes).toBe(625 * MB);
    expect(plan.totalRssBytes).toBe((510 + 20 + 30 + 625 + 150) * MB);
  });

  it('shows the foreground command, marks processes destructive and tabs and caches not', async () => {
    const { deps } = harness();
    const byId = new Map((await planFreeRam(deps)).candidates.map((c) => [c.id, c]));
    expect(byId.get('session:s-old-1')).toMatchObject({ command: 'vite dev', destructive: true });
    expect(byId.get('broker:300')).toMatchObject({ command: brokerArgv('gone'), destructive: true });
    expect(byId.get('tab:t1')).toMatchObject({ label: 'Docs', rssBytes: 150 * MB, destructive: false });
    expect(byId.get(CACHE_ID)).toMatchObject({ rssBytes: null, destructive: false });
  });

  it('does not attribute a renderer shared by two tabs to either', async () => {
    const { deps } = harness({
      hiddenTabs: () => [
        { tabId: 'a', label: 'A', pid: 500 },
        { tabId: 'b', label: 'B', pid: 500 },
      ],
    });
    const tabs = (await planFreeRam(deps)).candidates.filter((c) => c.kind === 'hidden-tab');
    expect(tabs.map((t) => t.rssBytes)).toEqual([null, null]);
  });

  it('offers no lost broker when the inventory is empty (fails closed) and throws without a process table', async () => {
    const empty = harness({ readInventory: async () => ({ brokers: [], primaryPid: null, noRowPtys: [], foreignSessionPids: [] }) });
    const kinds = (await planFreeRam(empty.deps)).candidates.map((c) => c.kind);
    expect(kinds).not.toContain('lost-broker');

    const blind = harness({ readRows: async () => null });
    await expect(planFreeRam(blind.deps)).rejects.toThrow('process table');
  });

  it('signals nothing', async () => {
    const h = harness();
    await planFreeRam(h.deps);
    expect(h.mocks.endSessions).not.toHaveBeenCalled();
    expect(h.mocks.killTree).not.toHaveBeenCalled();
    expect(h.mocks.discardTab).not.toHaveBeenCalled();
    expect(h.mocks.clearRendererCaches).not.toHaveBeenCalled();
  });
});

describe('runFreeRam', () => {
  it('ends sessions, then brokers, then tabs, then caches, and reports what it ended', async () => {
    const h = harness();
    const order: string[] = [];
    h.mocks.endSessions.mockImplementationOnce(async (ids: readonly string[]) => (order.push('sessions'), [...ids]));
    h.mocks.killTree.mockImplementation(async () => (order.push('broker'), { ok: true as const }));
    h.mocks.discardTab.mockImplementation(() => order.push('tab'));
    h.mocks.clearRendererCaches.mockImplementation(async () => void order.push('cache'));

    const outcome = await runFreeRam(h.deps, [CACHE_ID, 'tab:t1', 'broker:300', 'session:s-old-1']);
    expect(order).toEqual(['sessions', 'broker', 'tab', 'cache']);
    expect(h.mocks.endSessions).toHaveBeenCalledWith(['s-old-1']);
    expect(h.mocks.killTree).toHaveBeenCalledWith(300, brokerArgv('gone'));
    expect(h.mocks.discardTab).toHaveBeenCalledWith('t1');
    expect(outcome.ended.sort()).toEqual(['broker:300', CACHE_ID, 'session:s-old-1', 'tab:t1'].sort());
    expect(outcome.failures).toEqual([]);
  });

  it('measures freed RSS from the two snapshots, and the free-memory delta', async () => {
    const h = harness();
    let free = 1000 * MB;
    h.deps.freeBytes = async () => {
      const value = free;
      free += 1135 * MB;
      return value;
    };
    const outcome = await runFreeRam(h.deps, ['session:s-old-1', 'broker:300']);
    // Before: every row. After: sessions 201+202 and broker 300 + 301 gone = 10+500+25+600.
    const before = table().reduce((sum, r) => sum + r.rssBytes, 0);
    expect(outcome.measured.beforeRssBytes).toBe(before);
    expect(outcome.measured.afterRssBytes).toBe(before - 1135 * MB);
    expect(outcome.measured.freedRssBytes).toBe(1135 * MB);
    expect(outcome.measured.machineFreeDeltaBytes).toBe(1135 * MB);
  });

  it('reports zero, never a negative or an estimate, when memory grew or nothing was ended', async () => {
    const grew = harness();
    let calls = 0;
    grew.deps.snapshotRss = async () => (calls++ === 0 ? 100 * MB : 130 * MB);
    const a = await runFreeRam(grew.deps, [CACHE_ID]);
    expect(a.measured).toMatchObject({ beforeRssBytes: 100 * MB, afterRssBytes: 130 * MB, freedRssBytes: 0 });

    const nothing = harness();
    const b = await runFreeRam(nothing.deps, ['session:vanished']);
    expect(b.measured.freedRssBytes).toBe(0);
    expect(b.ended).toEqual([]);
    expect(b.failures).toEqual([{ id: 'session:vanished', message: 'No longer available to free.' }]);
  });

  it('reports a null free-memory delta when vm_stat is unreadable', async () => {
    const h = harness({ freeBytes: async () => null });
    expect((await runFreeRam(h.deps, [CACHE_ID])).measured.machineFreeDeltaBytes).toBeNull();
  });

  it('refuses ids the fresh plan does not contain, so a pid or the primary cannot be smuggled in', async () => {
    const h = harness();
    const outcome = await runFreeRam(h.deps, ['broker:100', 'broker:400', 'session:s-primary', 'session:s-foreign', 'pid:1']);
    expect(h.mocks.killTree).not.toHaveBeenCalled();
    expect(h.mocks.endSessions).not.toHaveBeenCalled();
    expect(outcome.ended).toEqual([]);
    expect(outcome.failures.map((f) => f.id).sort()).toEqual(
      ['broker:100', 'broker:400', 'pid:1', 'session:s-foreign', 'session:s-primary'].sort(),
    );
  });

  it('a failure in one step does not stop the rest, and each is reported by id', async () => {
    const h = harness();
    h.mocks.endSessions.mockRejectedValueOnce(new Error('Not a Studio session: s-old-1'));
    h.mocks.killTree.mockResolvedValueOnce({ ok: false, message: 'Only a terminal broker from this app can be ended.' });
    h.mocks.discardTab.mockImplementation(() => {
      throw new Error('tab gone');
    });

    const outcome = await runFreeRam(h.deps, ['session:s-old-1', 'broker:300', 'tab:t1', CACHE_ID]);
    expect(outcome.failures).toEqual([
      { id: 'session:s-old-1', message: 'Not a Studio session: s-old-1' },
      { id: 'broker:300', message: 'Only a terminal broker from this app can be ended.' },
      { id: 'tab:t1', message: 'tab gone' },
    ]);
    expect(outcome.ended).toEqual([CACHE_ID]);
    expect(h.mocks.clearRendererCaches).toHaveBeenCalledOnce();
  });

  it('treats a broker that already left after its last session ended as ended, without a second kill', async () => {
    const h = harness();
    // Ending both of broker 200's sessions shuts the broker down, as the real client does.
    h.mocks.endSessions.mockImplementationOnce(async (ids: readonly string[]) => {
      h.rows.current = dropTree(h.rows.current, 200);
      return [...ids];
    });
    const outcome = await runFreeRam(h.deps, ['session:s-old-1', 'session:s-old-2', 'broker:200']);
    expect(h.mocks.killTree).not.toHaveBeenCalled();
    expect(outcome.ended).toEqual(['session:s-old-1', 'session:s-old-2', 'broker:200']);
    expect(outcome.failures).toEqual([]);
  });

  it('skips a tab that became visible between the plan and the confirm', async () => {
    // runFreeRam reads the hidden list while planning, then again just before discarding.
    const hiddenTabs = vi.fn().mockReturnValueOnce([{ tabId: 't1', label: 'Docs', pid: 500 }]).mockReturnValue([]);
    const h = harness({ hiddenTabs });
    const outcome = await runFreeRam(h.deps, ['tab:t1']);
    expect(h.mocks.discardTab).not.toHaveBeenCalled();
    expect(outcome.failures).toEqual([{ id: 'tab:t1', message: 'The tab is visible again.' }]);
  });

  it('waits a bounded time for ended pids to leave the table, then measures anyway', async () => {
    const h = harness();
    // killTree "succeeds" but the process never exits.
    h.mocks.killTree.mockResolvedValue({ ok: true as const });
    const sleep = vi.fn(async () => undefined);
    h.deps.sleep = sleep;
    const outcome = await runFreeRam(h.deps, ['broker:300']);
    expect(sleep).toHaveBeenCalledTimes(20);
    expect(outcome.ended).toEqual(['broker:300']);
  });
});
