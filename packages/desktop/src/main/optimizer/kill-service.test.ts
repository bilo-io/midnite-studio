import { describe, expect, it, vi } from 'vitest';

import type { ProcessRow } from '../agent-process';
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
});
