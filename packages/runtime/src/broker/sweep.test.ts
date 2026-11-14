import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { planBrokerSweep, sweepBrokerDir, type BrokerSweepOptions } from './sweep';

const NOW = Date.now();
let dir: string;

const put = (name: string, content: string, ageMs = 10 * 60_000): void => {
  writeFileSync(join(dir, name), content);
  const t = (NOW - ageMs) / 1000;
  utimesSync(join(dir, name), t, t);
};

const options = (): BrokerSweepOptions => ({
  brokerDir: dir,
  ownSocketName: '0.2.0-own.sock',
  ownVersion: '0.2.0',
  isPidAlive: (pid) => pid === 4242,
  now: () => NOW,
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'broker-sweep-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('planBrokerSweep / sweepBrokerDir', () => {
  it('lists dead brokers’ files and old logs with sizes, and keeps live and own files', () => {
    put('0.1.0-a.sock.pid', '999');
    put('0.1.0-a.sock.token', 'tok');
    put('0.1.0.log', 'x'.repeat(100));
    put('0.1.5-b.sock.pid', '4242'); // live pid
    put('0.1.5-b.sock.token', 'tok');
    put('0.1.5.log', 'live version');
    put('0.2.0-own.sock.pid', '1');
    put('0.2.0.log', 'own');
    put('0.1.0-young.sock.pid', '998', 1_000);

    const plan = planBrokerSweep(options());
    expect(plan.entries.map((e) => e.name).sort()).toEqual(['0.1.0-a.sock.pid', '0.1.0-a.sock.token', '0.1.0.log']);
    expect(plan.entries.find((e) => e.name === '0.1.0.log')).toMatchObject({ kind: 'log', bytes: 100 });
    expect(plan.totalBytes).toBe(3 + 3 + 100);

    const outcome = sweepBrokerDir(options(), plan.entries.map((e) => e.name));
    expect(outcome).toEqual({ removed: 3, freedBytes: 106, skipped: [] });
    for (const kept of ['0.1.5-b.sock.pid', '0.1.5-b.sock.token', '0.1.5.log', '0.2.0-own.sock.pid', '0.2.0.log', '0.1.0-young.sock.pid']) {
      expect(existsSync(join(dir, kept))).toBe(true);
    }
  });

  it('refuses a confirmed name that is no longer stale, or was never in the plan', () => {
    put('0.1.0-a.sock.pid', '999');
    put('0.1.5-b.sock.pid', '4242');
    put('notes.txt', 'keep me');
    const outcome = sweepBrokerDir(options(), ['0.1.5-b.sock.pid', 'notes.txt', '../escape', '0.1.0-a.sock.pid']);
    expect(outcome.removed).toBe(1);
    expect(outcome.skipped.map((s) => s.name).sort()).toEqual(['../escape', '0.1.5-b.sock.pid', 'notes.txt']);
    expect(existsSync(join(dir, '0.1.5-b.sock.pid'))).toBe(true);
    expect(existsSync(join(dir, 'notes.txt'))).toBe(true);
  });

  it('plans nothing for a missing directory', () => {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir), { recursive: true });
    expect(planBrokerSweep({ ...options(), brokerDir: join(dir, 'nope') })).toEqual({ entries: [], totalBytes: 0 });
  });
});
