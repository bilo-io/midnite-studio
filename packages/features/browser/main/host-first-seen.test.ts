import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HOSTS_SEEN_CAP, HOSTS_SEEN_FILE, createHostFirstSeenStore, hostDigest, isSameLocalDay } from './host-first-seen';

describe('host first-seen ledger (Phase 117 Theme F)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hosts-seen-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('keeps the first visit and ignores later ones', () => {
    let t = 1_000;
    const store = createHostFirstSeenStore({ now: () => t });
    expect(store.note('example.com')).toBe(1_000);
    t = 9_000;
    expect(store.note('example.com')).toBe(1_000);
    expect(store.note('WWW.Example.com.')).toBe(1_000);
    expect(store.firstSeen('other.example')).toBeUndefined();
  });

  it('persists digests, never hostnames, in a 0600 file that survives a restart', () => {
    const store = createHostFirstSeenStore({ directory: dir, now: () => 42 });
    store.note('secret-bank.example');
    store.flush();
    const file = join(dir, HOSTS_SEEN_FILE);
    const text = readFileSync(file, 'utf8');
    expect(text).not.toContain('secret-bank');
    expect(text).toContain(hostDigest('secret-bank.example'));
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(createHostFirstSeenStore({ directory: dir, now: () => 99 }).firstSeen('secret-bank.example')).toBe(42);
  });

  it('clear() forgets every host and deletes the file', () => {
    const store = createHostFirstSeenStore({ directory: dir });
    store.note('a.example');
    store.flush();
    store.clear();
    expect(existsSync(join(dir, HOSTS_SEEN_FILE))).toBe(false);
    expect(store.firstSeen('a.example')).toBeUndefined();
  });

  it('evicts the oldest host past the cap', () => {
    let t = 0;
    const store = createHostFirstSeenStore({ now: () => ++t });
    for (let i = 0; i <= HOSTS_SEEN_CAP; i += 1) store.note(`h${i}.example`);
    expect(store.firstSeen('h0.example')).toBeUndefined();
    expect(store.firstSeen(`h${HOSTS_SEEN_CAP}.example`)).toBe(HOSTS_SEEN_CAP + 1);
  });

  it('starts empty on a corrupt file', () => {
    const store = createHostFirstSeenStore({ directory: dir });
    store.note('x.example');
    store.flush();
    writeFileSync(join(dir, HOSTS_SEEN_FILE), '{nope');
    expect(createHostFirstSeenStore({ directory: dir }).firstSeen('x.example')).toBeUndefined();
  });

  it('isSameLocalDay compares calendar days, not 24h windows', () => {
    const morning = new Date(2026, 9, 22, 8).getTime();
    expect(isSameLocalDay(morning, new Date(2026, 9, 22, 23, 59).getTime())).toBe(true);
    expect(isSameLocalDay(morning, new Date(2026, 9, 23, 0, 1).getTime())).toBe(false);
  });
});
