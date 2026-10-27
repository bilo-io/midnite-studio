import { describe, expect, it } from 'vitest';

import { createDenialWatcher, parseSandboxDenial } from './confine-denials';

const line = (proc: string, pid: number, op: string, target: string): string =>
  `2026-10-23 17:33:19.668 E  kernel[0:2e18b9] (Sandbox) Sandbox: ${proc}(${pid}) deny(1) ${op} ${target}`;

describe('parseSandboxDenial', () => {
  it('reads process, pid, operation and a target with spaces', () => {
    expect(parseSandboxDenial(line('cat', 23461, 'file-read-data', '/Users/u/My Docs/x'))).toEqual({
      process: 'cat', pid: 23461, operation: 'file-read-data', target: '/Users/u/My Docs/x',
    });
  });
  it('skips duplicate reports and unrelated lines', () => {
    expect(parseSandboxDenial('(Sandbox) 1 duplicate report for Sandbox: cat(1) deny(1) file-read-data /x')).toBeNull();
    expect(parseSandboxDenial('hello')).toBeNull();
  });
});

describe('createDenialWatcher', () => {
  function setup(threshold = 3) {
    const records: unknown[] = [];
    const findings: unknown[] = [];
    let stops = 0;
    let opened = 0;
    let t = 0;
    const watcher = createDenialWatcher({
      audit: { record: (r) => (records.push(r), 'id') },
      raiseFinding: (f) => findings.push(f),
      threshold,
      windowMs: 1000,
      now: () => t++ ,
      openStream: () => (opened++, { stop: () => void stops++ }),
      processTable: async () => new Map([[200, 100], [300, 200]]),
    });
    return { watcher, records, findings, stops: () => stops, opened: () => opened };
  }

  it('attributes a descendant pid to its session and records a confine-denial', async () => {
    const s = setup();
    s.watcher.track('sess', 100);
    await s.watcher.handleLine(line('cat', 300, 'file-read-data', '/Users/u/.ssh/id_rsa'));
    await s.watcher.handleLine(line('cat', 999, 'file-read-data', '/elsewhere'));
    expect(s.records).toEqual([{ kind: 'confine-denial', sessionId: 'sess', operation: 'file-read-data', target: '/Users/u/.ssh/id_rsa' }]);
  });

  it('raises one finding at the threshold, not one below, and not twice', async () => {
    const s = setup(3);
    s.watcher.track('sess', 100);
    await s.watcher.handleLine(line('a', 200, 'file-write-create', '/x'));
    await s.watcher.handleLine(line('a', 200, 'file-write-create', '/y'));
    expect(s.findings).toHaveLength(0);
    await s.watcher.handleLine(line('a', 200, 'file-write-create', '/z'));
    await s.watcher.handleLine(line('a', 200, 'file-write-create', '/w'));
    expect(s.findings).toHaveLength(1);
  });

  it('opens one stream for many sessions and closes it with the last', () => {
    const s = setup();
    s.watcher.track('a', 1);
    s.watcher.track('b', 2);
    expect(s.opened()).toBe(1);
    s.watcher.untrack('a');
    expect(s.stops()).toBe(0);
    s.watcher.untrack('b');
    expect(s.stops()).toBe(1);
  });
});
