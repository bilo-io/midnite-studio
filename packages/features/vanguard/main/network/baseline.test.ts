import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  BASELINE_MAX_PER_REPO,
  BASELINE_WINDOW_MS,
  coerceBaseline,
  emptyBaseline,
  loadNetworkBaseline,
  networkBaselinePath,
  observeDestination,
  pruneBaseline,
  saveNetworkBaseline,
} from './baseline';

const DAY = 24 * 60 * 60 * 1000;

describe('observeDestination', () => {
  it('is new the first time, known after, and per repo', () => {
    const b = emptyBaseline();
    expect(observeDestination(b, 'r1', '1.2.3.4:443', 1000)).toBe('new');
    expect(observeDestination(b, 'r1', '1.2.3.4:443', 2000)).toBe('known');
    expect(observeDestination(b, 'r2', '1.2.3.4:443', 3000)).toBe('new');
    expect(b.repos['r1']!['1.2.3.4:443']).toEqual({ firstSeen: 1000, lastSeen: 2000 });
  });

  it('is new again once a destination has not been seen for 30 days', () => {
    const b = emptyBaseline();
    observeDestination(b, 'r1', 'k', 0);
    expect(observeDestination(b, 'r1', 'k', BASELINE_WINDOW_MS)).toBe('known');
    expect(observeDestination(b, 'r1', 'k', BASELINE_WINDOW_MS + 31 * DAY)).toBe('new');
  });

  it('keeps a repo to its cap, dropping the least recently seen', () => {
    const b = emptyBaseline();
    for (let i = 0; i <= BASELINE_MAX_PER_REPO; i += 1) observeDestination(b, 'r', `h${i}:1`, i);
    const keys = Object.keys(b.repos['r']!);
    expect(keys).toHaveLength(BASELINE_MAX_PER_REPO);
    expect(keys).not.toContain('h0:1');
  });
});

describe('pruneBaseline', () => {
  it('drops stale entries and empty repos', () => {
    const b = emptyBaseline();
    observeDestination(b, 'old', 'a', 0);
    observeDestination(b, 'mixed', 'a', 0);
    observeDestination(b, 'mixed', 'b', 40 * DAY);
    pruneBaseline(b, 40 * DAY);
    expect(Object.keys(b.repos)).toEqual(['mixed']);
    expect(Object.keys(b.repos['mixed']!)).toEqual(['b']);
  });
});

describe('coerceBaseline', () => {
  it('drops what is malformed rather than trusting it', () => {
    expect(coerceBaseline(null)).toEqual(emptyBaseline());
    expect(coerceBaseline({ version: 2, repos: {} })).toEqual(emptyBaseline());
    expect(
      coerceBaseline({ version: 1, repos: { r: { good: { firstSeen: 1, lastSeen: 2 }, bad: { firstSeen: 'x' } }, s: 5 } }),
    ).toEqual({ version: 1, repos: { r: { good: { firstSeen: 1, lastSeen: 2 } } } });
  });
});

describe('the file store', () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('round-trips, at 0700 and 0600', async () => {
    dir = await mkdtemp(join(tmpdir(), 'vanguard-net-'));
    const b = emptyBaseline();
    observeDestination(b, 'r', '1.2.3.4:443', 5);
    await saveNetworkBaseline(dir, b);
    expect((await stat(join(dir, 'vanguard'))).mode & 0o777).toBe(0o700);
    expect((await stat(networkBaselinePath(dir))).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(networkBaselinePath(dir), 'utf8'))).toEqual(b);
    expect(await loadNetworkBaseline(dir)).toEqual(b);
  });

  it('loads an empty baseline when there is no file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'vanguard-net-'));
    expect(await loadNetworkBaseline(dir)).toEqual(emptyBaseline());
  });
});
