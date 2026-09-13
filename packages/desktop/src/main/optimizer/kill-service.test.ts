import { describe, expect, it, vi } from 'vitest';

import { parsePsTable, type ProcessRow } from '../agent-process';
import { getProcessTableResult, killProcess } from './kill-service';

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
});
