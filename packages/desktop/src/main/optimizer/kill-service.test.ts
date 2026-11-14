import { describe, expect, it, vi } from 'vitest';

import { parsePsTable, type ProcessRow } from '../agent-process';
import { classifyBrokers, EMPTY_INVENTORY } from './broker-inventory';
import { agentOwnerLabels, getProcessTableResult, killProcess, killTree } from './kill-service';

describe('killProcess', () => {
  const midnitePid = 1000;
  const ptyPid = 2000;
  const agentPid = 2001;

  const sampleRows: ProcessRow[] = [
    { pid: 1, ppid: 0, stat: 'Ss', rssBytes: 10000, cpuPercent: 0, args: '/sbin/launchd' },
    { pid: midnitePid, ppid: 1, stat: 'S', rssBytes: 50000, cpuPercent: 0, args: 'midnite-studio' },
    { pid: ptyPid, ppid: 1, stat: 'S', rssBytes: 20000, cpuPercent: 0, args: '/bin/zsh' },
    { pid: agentPid, ppid: ptyPid, stat: 'S+', rssBytes: 80000, cpuPercent: 5.0, args: 'claude --dangerously-skip-permissions' },
    { pid: 3000, ppid: 1, stat: 'S', rssBytes: 40000, cpuPercent: 1.0, args: '/Applications/Slack.app/Slack' },
    { pid: 3001, ppid: 1, stat: 'S', rssBytes: 30000, cpuPercent: 0, args: 'WindowServer -daemon' },
  ];

  const defaultOpts = {
    mockRows: sampleRows,
    ptyPids: [ptyPid],
    midnitePid,
  };

  it('refuses to kill protected PIDs: PID 1 and Midnite main PID', async () => {
    const res1 = await killProcess(1, '/sbin/launchd', false, defaultOpts);
    expect(res1.ok).toBe(false);
    if (!res1.ok) expect(res1.message).toContain('protected');

    const resMidnite = await killProcess(midnitePid, 'midnite-studio', false, defaultOpts);
    expect(resMidnite.ok).toBe(false);
    if (!resMidnite.ok) expect(resMidnite.message).toContain('protected');
  });

  it('refuses to kill non-existent process', async () => {
    const res = await killProcess(99999, 'nonexistent', false, defaultOpts);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain('no longer exists');
  });

  it('refuses to kill protected system processes by name', async () => {
    const res = await killProcess(3001, 'WindowServer -daemon', false, defaultOpts);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain('protected');
  });

  it('refuses to kill non-Midnite user process', async () => {
    const res = await killProcess(3000, '/Applications/Slack.app/Slack', false, defaultOpts);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain('Only Midnite-spawned processes');
  });

  it('refuses when expectArgv mismatches (PID-reuse guard)', async () => {
    const res = await killProcess(agentPid, 'claude --different-args', false, defaultOpts);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain('PID reuse detected');
  });

  /**
   * Finding 2: under the four-column fallback this comparison was against
   * `expectArgv`, which itself moved between reads because RSS/%CPU rode
   * along inside `args` — a legitimate kill got refused as "reuse". The
   * comparison is on the parsed `args` string alone, so a numeric column
   * changing between two reads must not move it.
   */
  it("still matches expectArgv after a second read whose RSS/CPU changed (Finding 2's dead guard)", async () => {
    const firstRead: ProcessRow[] = sampleRows.map((r) =>
      r.pid === agentPid ? { ...r, rssBytes: 80_000, cpuPercent: 5.0 } : r,
    );
    const secondRead: ProcessRow[] = sampleRows.map((r) =>
      r.pid === agentPid ? { ...r, rssBytes: 91_234, cpuPercent: 11.2 } : r,
    );

    const firstResult = await getProcessTableResult(firstRead);
    const expectArgv = firstResult.processes.find((p) => p.pid === agentPid)?.argv ?? '';

    const signalFn = vi.fn();
    const res = await killProcess(agentPid, expectArgv, false, {
      ...defaultOpts,
      mockRows: secondRead,
      signalFn,
    });

    expect(res.ok).toBe(true);
    expect(signalFn).toHaveBeenCalledWith(agentPid, 'SIGTERM');
  });

  /**
   * Finding 2: `PROTECTED_PROCESS_NAMES` can never match while the fallback
   * shifts argv, because `commandName` reads a stray numeric column instead
   * of the real program name. No test exercised this deny-list entry before
   * Theme B — this is the one for `logd`.
   */
  it('refuses to kill logd, resolved from a real path via commandName', async () => {
    const logdPid = 4000;
    const rowsWithLogd: ProcessRow[] = [
      ...sampleRows,
      { pid: logdPid, ppid: 1, stat: 'S', rssBytes: 12_000, cpuPercent: 0, args: '/usr/libexec/logd' },
    ];

    const res = await killProcess(logdPid, '/usr/libexec/logd', false, {
      ...defaultOpts,
      mockRows: rowsWithLogd,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain('protected');
  });

  it('sends SIGTERM by default on valid Midnite agent process', async () => {
    const signalFn = vi.fn();
    const res = await killProcess(agentPid, 'claude --dangerously-skip-permissions', false, {
      ...defaultOpts,
      signalFn,
    });

    expect(res.ok).toBe(true);
    expect(signalFn).toHaveBeenCalledWith(agentPid, 'SIGTERM');
  });

  it('sends SIGKILL when force: true', async () => {
    const signalFn = vi.fn();
    const res = await killProcess(agentPid, 'claude --dangerously-skip-permissions', true, {
      ...defaultOpts,
      signalFn,
    });

    expect(res.ok).toBe(true);
    expect(signalFn).toHaveBeenCalledWith(agentPid, 'SIGKILL');
  });

  it('treats ESRCH (already gone) as ok: true', async () => {
    const signalFn = vi.fn(() => {
      const err = new Error('No such process') as NodeJS.ErrnoException;
      err.code = 'ESRCH';
      throw err;
    });

    const res = await killProcess(agentPid, 'claude --dangerously-skip-permissions', false, {
      ...defaultOpts,
      signalFn,
    });

    expect(res.ok).toBe(true);
  });

  it('reports EPERM error safely without throwing', async () => {
    const signalFn = vi.fn(() => {
      const err = new Error('Operation not permitted') as NodeJS.ErrnoException;
      err.code = 'EPERM';
      throw err;
    });

    const res = await killProcess(agentPid, 'claude --dangerously-skip-permissions', false, {
      ...defaultOpts,
      signalFn,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain('Permission denied');
  });
});

describe('getProcessTableResult', () => {
  it('returns processes sorted by rssBytes descending with ours flag attached', async () => {
    const sampleRows: ProcessRow[] = [
      { pid: 10, ppid: 1, stat: 'S', rssBytes: 1000, cpuPercent: 0, args: 'small-app' },
      { pid: 20, ppid: 1, stat: 'S', rssBytes: 5000, cpuPercent: 1.0, args: 'big-app' },
      { pid: 30, ppid: 1, stat: 'S', rssBytes: 3000, cpuPercent: 0.5, args: 'medium-app' },
    ];

    const result = await getProcessTableResult(sampleRows);
    expect(result.processes).toHaveLength(3);
    expect(result.processes[0]?.pid).toBe(20);
    expect(result.processes[1]?.pid).toBe(30);
    expect(result.processes[2]?.pid).toBe(10);
  });

  /**
   * Finding 2: under the four-column fallback, `args` captured
   * `"22560   0,7 /sbin/launchd"` — RSS and %CPU prepended — so `commandName`
   * (`args.trim().split(/\s+/)[0]`) read the Name column as `22560`. Feeding
   * a genuinely six-column `ps` line through the real parser proves the row
   * `getProcessTableResult` builds now names the process correctly.
   */
  it('names a real six-column row launchd, not the rss column it used to shift into args', async () => {
    const { rows } = parsePsTable('    1     0 Ss    22560   0.7 /sbin/launchd');
    const result = await getProcessTableResult(rows);

    expect(result.processes).toHaveLength(1);
    expect(result.processes[0]?.name).toBe('launchd');
    expect(result.processes[0]?.name).not.toBe('22560');
  });

  it('leaves error null for a genuinely empty table', async () => {
    const result = await getProcessTableResult([]);
    expect(result.processes).toHaveLength(0);
    expect(result.error).toBeNull();
  });

  it('sets error when every line failed to parse (a locale mismatch, not an empty table)', async () => {
    const commaLines = Array.from(
      { length: 5 },
      () => '    1     0 Ss    22560   0,7 /sbin/launchd',
    ).join('\n');
    const { totalLines } = parsePsTable(commaLines);
    expect(totalLines).toBe(5);

    const result = await getProcessTableResult({ rows: [], totalLines });
    expect(result.processes).toHaveLength(0);
    expect(result.error).toBe('Could not parse the process table (5 lines, 0 rows).');
  });

  it('merges mockMetrics with preferred CPU and sets ours: true (Phase 85 Theme E)', async () => {
    const sampleRows: ProcessRow[] = [
      { pid: 100, ppid: 1, stat: 'S', rssBytes: 50_000, cpuPercent: 1.0, args: 'midnite-helper' },
      { pid: 200, ppid: 1, stat: 'S', rssBytes: 30_000, cpuPercent: 0.5, args: 'other-app' },
    ];
    const mockMetrics = [
      {
        pid: 100,
        type: 'Tab' as const,
        cpu: { percentCPUUsage: 8.5, idleWakeupsPerSecond: 0 },
        creationTime: 12345,
        memory: { workingSetSize: 0, peakWorkingSetSize: 0 },
      },
    ];

    const result = await getProcessTableResult(sampleRows, mockMetrics);
    const helper = result.processes.find((p) => p.pid === 100);
    expect(helper?.cpuPercent).toBe(8.5); // Preferred Electron CPU
    expect(helper?.rssBytes).toBe(50_000); // Preserved ps RSS
    expect(helper?.ours).toBe(true);

    const other = result.processes.find((p) => p.pid === 200);
    expect(other?.cpuPercent).toBe(0.5);
    expect(other?.ours).toBe(false);
  });

  it('includes owner attribution when provided in options', async () => {
    const sampleRows: ProcessRow[] = [
      { pid: 100, ppid: 1, stat: 'S', rssBytes: 50_000, cpuPercent: 1.0, args: 'midnite-helper' },
    ];
    const owners = new Map<number, string>([[100, 'Tab: GitHub']]);

    const result = await getProcessTableResult(sampleRows, { owners });
    expect(result.processes[0]?.owner).toBe('Tab: GitHub');
  });
});


describe('killProcess / killTree over the lost-process inventory (Phase 148 B)', () => {
  const midnitePid = 1000;
  const DIR = '/u/Midnite Studio/broker';
  const brokerArgs = (socket: string) => `/App/Midnite Studio /App/dist/broker.js --socket ${socket} --user-data /u`;
  const PRIMARY = `${DIR}/0.4.0-cafe0001.sock`;
  // Two brokers retired off an old build's path: ppid 1, 4 and 2 ptys.
  const OLD_A = `${DIR}/0.3.9-dead0002.sock`;
  const OLD_B = `${DIR}/0.3.8-beef0003.sock`;
  const row = (pid: number, ppid: number, args: string): ProcessRow => ({
    pid, ppid, stat: 'S', rssBytes: 1_000_000, cpuPercent: 0, args,
  });
  const rows: ProcessRow[] = [
    row(midnitePid, 1, 'midnite-studio'),
    row(100, 1, brokerArgs(PRIMARY)),
    row(101, 100, '/bin/zsh -l'),
    row(200, 1, brokerArgs(OLD_A)),
    ...[201, 202, 203, 204].map((pid) => row(pid, 200, '/bin/zsh -l')),
    row(300, 1, brokerArgs(OLD_B)),
    ...[301, 302].map((pid) => row(pid, 300, '/bin/zsh -l')),
    row(303, 302, 'claude'),
  ];
  const inventory = (owner: string | null = 'studio') =>
    classifyBrokers({
      brokerDir: DIR,
      primarySocket: PRIMARY,
      pidFiles: [
        { socketName: '0.4.0-cafe0001.sock', pid: 100 },
        { socketName: '0.3.9-dead0002-retired-200.sock', pid: 200 },
        { socketName: '0.3.8-beef0003-retired-300.sock', pid: 300 },
      ],
      socketNames: new Set(['0.4.0-cafe0001.sock', '0.3.9-dead0002-retired-200.sock']),
      rows,
      connectedPeers: [PRIMARY, `${DIR}/0.3.9-dead0002-retired-200.sock`],
      sessionRows: null,
      brokerSessions: [{ pid: 301, sessionId: 's', owner, cwd: '/r' }],
    });
  const opts = (signalFn = vi.fn(), inv = inventory()) => ({
    mockRows: rows,
    ptyPids: [101],
    midnitePid,
    inventory: inv,
    signalFn,
  });

  it('kills a ppid-1 previous-build broker with SIGTERM to the broker alone', async () => {
    const signalFn = vi.fn();
    const res = await killProcess(200, brokerArgs(OLD_A), false, opts(signalFn));
    expect(res).toEqual({ ok: true });
    expect(signalFn.mock.calls).toEqual([[200, 'SIGTERM']]);
  });

  it('force-kills the whole tree deepest first, broker last', async () => {
    const signalFn = vi.fn();
    const res = await killTree(300, brokerArgs(OLD_B), true, opts(signalFn));
    expect(res).toEqual({ ok: true });
    expect(signalFn.mock.calls.map((c) => c[0])).toEqual([303, 301, 302, 300]);
    expect(signalFn.mock.calls.every((c) => c[1] === 'SIGKILL')).toBe(true);
  });

  it('accepts a process inside a lost broker’s tree', async () => {
    const signalFn = vi.fn();
    expect(await killProcess(303, 'claude', false, opts(signalFn))).toEqual({ ok: true });
  });

  it('refuses the current primary broker, from either entry point', async () => {
    const signalFn = vi.fn();
    for (const res of [
      await killProcess(100, brokerArgs(PRIMARY), true, opts(signalFn)),
      await killTree(100, brokerArgs(PRIMARY), true, opts(signalFn)),
    ]) {
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.message).toContain('current terminal broker');
    }
    expect(signalFn).not.toHaveBeenCalled();
  });

  it('refuses the main pid', async () => {
    const res = await killTree(midnitePid, 'midnite-studio', false, opts());
    expect(res.ok).toBe(false);
  });

  it('refuses a broker whose argv changed (PID reuse)', async () => {
    const signalFn = vi.fn();
    const res = await killProcess(200, brokerArgs(OLD_B), false, opts(signalFn));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain('PID reuse');
    expect(signalFn).not.toHaveBeenCalled();
  });

  it('refuses a tree holding another app’s session, and that session itself', async () => {
    const signalFn = vi.fn();
    const inv = inventory('agents');
    const tree = await killTree(300, brokerArgs(OLD_B), false, opts(signalFn, inv));
    expect(tree.ok).toBe(false);
    const session = await killProcess(301, '/bin/zsh -l', false, opts(signalFn, inv));
    expect(session.ok).toBe(false);
    expect(signalFn).not.toHaveBeenCalled();
  });

  it('refuses a ppid-1 broker the inventory does not list', async () => {
    const res = await killProcess(200, brokerArgs(OLD_A), false, opts(vi.fn(), EMPTY_INVENTORY));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain('Only Midnite-spawned');
  });

  it('stamps lost and brokerPid on the table, with the primary left unkillable', async () => {
    const result = await getProcessTableResult(rows, {
      mockMetrics: [],
      ptyPids: [101],
      owners: new Map(),
      inventory: inventory(),
      brokerSessions: [],
      agents: [],
    });
    const by = new Map(result.processes.map((p) => [p.pid, p]));
    expect(by.get(100)).toMatchObject({ ours: false, lost: null, brokerPid: 100 });
    expect(by.get(204)).toMatchObject({ ours: true, lost: 'previous-build', brokerPid: 200 });
    expect(by.get(303)).toMatchObject({ ours: true, lost: 'unreachable', brokerPid: 300 });
  });
});

describe('agentOwnerLabels (Phase 148 B)', () => {
  it('labels a pty tree "<repo> · <agent>" when an agent runs in it', () => {
    const rows: ProcessRow[] = [
      { pid: 10, ppid: 1, stat: 'S', rssBytes: 1, cpuPercent: 0, args: '/bin/zsh -l' },
      { pid: 11, ppid: 10, stat: 'S+', rssBytes: 1, cpuPercent: 0, args: 'claude' },
      { pid: 20, ppid: 1, stat: 'S', rssBytes: 1, cpuPercent: 0, args: '/bin/zsh -l' },
    ];
    const labels = agentOwnerLabels(
      rows,
      [
        { pid: 10, sessionId: 'a', owner: 'studio', cwd: '/code/midnite-studio' },
        { pid: 20, sessionId: 'b', owner: 'studio', cwd: '/code/other' },
      ],
      [{ id: 'claude', label: 'Claude Code', command: 'claude', args: [] } as never],
    );
    expect(labels.get(10)).toBe('midnite-studio · Claude Code');
    expect(labels.get(11)).toBe('midnite-studio · Claude Code');
    expect(labels.has(20)).toBe(false);
  });
});
