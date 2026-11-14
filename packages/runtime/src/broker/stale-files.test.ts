import { describe, expect, it } from 'vitest';

import { isPidAlive, STALE_FILE_MIN_AGE_MS, staleBrokerFiles, type BrokerDirEntry } from './stale-files';

const NOW = 10_000_000;
const OLD = NOW - STALE_FILE_MIN_AGE_MS - 1;
const LIVE = new Set([111, 222]);

const sweep = (entries: BrokerDirEntry[], own = '0.0.6-new.sock'): string[] =>
  staleBrokerFiles(entries, { ownSocketName: own, isPidAlive: (pid) => LIVE.has(pid), now: NOW });

const file = (name: string, pid: number | null = null, mtimeMs = OLD): BrokerDirEntry => ({ name, pid, mtimeMs });

describe('staleBrokerFiles', () => {
  it('removes the pid and token of a broker whose socket is gone and whose pid is dead', () => {
    expect(sweep([file('0.0.4-a.sock.pid', 999), file('0.0.4-a.sock.token')]).sort()).toEqual([
      '0.0.4-a.sock.pid',
      '0.0.4-a.sock.token',
    ]);
  });

  it('reads a retired broker’s pid off its name when it has no pid file', () => {
    expect(sweep([file('0.0.6-x-retired-999.sock.token')])).toEqual(['0.0.6-x-retired-999.sock.token']);
    expect(sweep([file('0.0.6-x-retired-111.sock.token')])).toEqual([]);
  });

  it('never touches the files of a live pid, even with the socket missing', () => {
    expect(sweep([file('0.0.6-y.sock.pid', 222), file('0.0.6-y.sock.token')])).toEqual([]);
  });

  it('keeps every companion of a socket still on disk — the probe found it live', () => {
    expect(sweep([file('0.0.6-z.sock'), file('0.0.6-z.sock.pid', 999), file('0.0.6-z.sock.token')])).toEqual([]);
  });

  it('leaves its own socket’s files to the spawn path', () => {
    expect(sweep([file('0.0.6-new.sock.token'), file('0.0.6-new.sock.pid', 999)])).toEqual([]);
  });

  it('leaves a file too young to judge — a broker may still be starting', () => {
    expect(sweep([file('0.0.6-w.sock.token', null, NOW - 1_000)])).toEqual([]);
  });

  it('treats an unparseable pid file as no pid at all', () => {
    expect(sweep([file('0.0.6-v.sock.pid', null)])).toEqual(['0.0.6-v.sock.pid']);
  });

  it('ignores everything that is not a pid or token file', () => {
    expect(sweep([file('0.0.6.log'), file('0.0.6-q.sock')])).toEqual([]);
  });
});

describe('isPidAlive', () => {
  it('knows this process is alive and a non-pid is not', () => {
    expect(isPidAlive(process.pid)).toBe(true);
    expect(isPidAlive(0)).toBe(false);
    expect(isPidAlive(-5)).toBe(false);
  });
});
