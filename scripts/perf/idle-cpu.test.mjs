import { describe, expect, it } from 'vitest';
import { classifyGitGhSpawns, computeCpuDeltas, parsePsRows } from './idle-cpu.mjs';

/** One synthetic `ps -Ao pid=,ppid=,comm=,args=` line, tab/space-agnostic like the real output. */
function row(pid, ppid, comm, args = comm) {
  return `${pid} ${ppid} ${comm} ${args}`;
}

describe('parsePsRows', () => {
  it('parses pid/ppid/comm and joins the rest as args', () => {
    const out = row(100, 1, 'Electron', '/Applications/Electron --type=renderer --foo=bar');
    const [parsed] = parsePsRows(out);
    expect(parsed).toEqual({
      pid: 100,
      ppid: 1,
      comm: 'Electron',
      args: '/Applications/Electron --type=renderer --foo=bar',
    });
  });

  it('drops blank lines and rows with a non-numeric pid/ppid', () => {
    const out = ['', '  ', row(1, 0, 'launchd')].join('\n');
    expect(parsePsRows(out)).toEqual([{ pid: 1, ppid: 0, comm: 'launchd', args: 'launchd' }]);
  });
});

describe('classifyGitGhSpawns', () => {
  it('counts a git child of main', () => {
    const rows = parsePsRows(
      [row(1, 0, 'Electron'), row(2, 1, 'git', '/usr/bin/git fetch --prune')].join('\n'),
    );
    const { git, gh } = classifyGitGhSpawns(rows, 1);
    expect([...git.keys()]).toEqual([2]);
    expect(gh.size).toBe(0);
  });

  it('counts a gh child at any depth, not just a direct child', () => {
    const rows = parsePsRows(
      [
        row(1, 0, 'Electron'),
        row(2, 1, 'node', 'node forge-poller-helper'), // an intermediate hop
        row(3, 2, 'gh', '/opt/homebrew/bin/gh run list'),
      ].join('\n'),
    );
    const { git, gh } = classifyGitGhSpawns(rows, 1);
    expect(git.size).toBe(0);
    expect([...gh.keys()]).toEqual([3]);
  });

  it('ignores a git/gh process that is not a descendant of the root pid', () => {
    const rows = parsePsRows(
      [row(1, 0, 'Electron'), row(50, 1, 'renderer'), row(99, 1, 'other-app'), row(7, 500, 'git')].join(
        '\n',
      ),
    );
    const { git, gh } = classifyGitGhSpawns(rows, 1);
    expect(git.size).toBe(0);
    expect(gh.size).toBe(0);
  });

  it('does not false-positive on a name that merely starts with git/gh', () => {
    const rows = parsePsRows(
      [
        row(1, 0, 'Electron'),
        row(2, 1, 'github-desktop-helper', '/Applications/GitHub Desktop.app/Contents/helper'),
        row(3, 1, 'gitkraken', 'gitkraken --background'),
      ].join('\n'),
    );
    const { git, gh } = classifyGitGhSpawns(rows, 1);
    expect(git.size).toBe(0);
    expect(gh.size).toBe(0);
  });

  it('is stable against a cyclic ppid table (never infinite-loops)', () => {
    // Pathological input a real ps snapshot should never produce, but the
    // walk must not hang on it: 2 and 3 point at each other.
    const rows = parsePsRows([row(1, 0, 'Electron'), row(2, 3, 'git'), row(3, 2, 'node')].join('\n'));
    expect(() => classifyGitGhSpawns(rows, 1)).not.toThrow();
  });
});

describe('computeCpuDeltas', () => {
  it('calculates percent of one core per group and total across elapsed time', () => {
    const start = new Map([
      [10, { cpu: 5.0, group: 'main' }],
      [20, { cpu: 10.0, group: 'renderer' }],
    ]);
    const end = new Map([
      [10, { cpu: 6.0, group: 'main' }], // 1s CPU in 10s = 10%
      [20, { cpu: 12.5, group: 'renderer' }], // 2.5s CPU in 10s = 25%
    ]);
    const deltas = computeCpuDeltas(start, end, 10);
    expect(deltas.main).toBe(10);
    expect(deltas.renderer).toBe(25);
    expect(deltas.total).toBe(35);
  });

  it('drops pids that appeared or disappeared mid-window', () => {
    const start = new Map([[10, { cpu: 5.0, group: 'main' }]]);
    const end = new Map([
      [10, { cpu: 6.0, group: 'main' }],
      [30, { cpu: 2.0, group: 'other' }], // new pid
    ]);
    const deltas = computeCpuDeltas(start, end, 10);
    expect(deltas.main).toBe(10);
    expect(deltas.other).toBe(0);
    expect(deltas.total).toBe(10);
  });
});

