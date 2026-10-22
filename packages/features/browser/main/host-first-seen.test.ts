import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HOSTS_SEEN_CAP, HOSTS_SEEN_FILE, createHostFirstSeenStore, localDay, type LedgerCipher } from './host-first-seen';

/** A reversible stand-in for `safeStorage` that marks what it wrapped, so a test can see the key is never stored bare. */
const cipher: LedgerCipher = {
  isEncryptionAvailable: () => true,
  encryptString: (plain) => Buffer.from(`enc:${Buffer.from(plain).toString('base64')}`),
  decryptString: (blob) => {
    const text = blob.toString();
    if (!text.startsWith('enc:')) throw new Error('not ours');
    return Buffer.from(text.slice(4), 'base64').toString();
  },
};

const day = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();

describe('host first-seen ledger (Phase 117 Theme F)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hosts-seen-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('keeps the first visit day and ignores later ones', () => {
    let t = day(2026, 9, 20);
    const store = createHostFirstSeenStore({ now: () => t });
    expect(store.note('example.com')).toBe(localDay(day(2026, 9, 20)));
    t = day(2026, 9, 22);
    expect(store.note('example.com')).toBe(localDay(day(2026, 9, 20)));
    expect(store.note('WWW.Example.com.')).toBe(localDay(day(2026, 9, 20)));
    expect(store.firstSeen('other.example')).toBeUndefined();
  });

  it('persists keyed digests and day numbers — never hostnames, times or the bare key — in a 0600 file', () => {
    const store = createHostFirstSeenStore({ directory: dir, cipher, now: () => day(2026, 9, 22, 9) });
    store.note('secret-bank.example');
    store.flush();
    const file = join(dir, HOSTS_SEEN_FILE);
    const text = readFileSync(file, 'utf8');
    const persisted = JSON.parse(text) as { version: number; key: string; hosts: Record<string, number> };
    expect(text).not.toContain('secret-bank');
    expect(Object.values(persisted.hosts)).toEqual([localDay(day(2026, 9, 22))]);
    expect(Buffer.from(persisted.key, 'base64').toString()).toMatch(/^enc:/);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(createHostFirstSeenStore({ directory: dir, cipher }).firstSeen('secret-bank.example')).toBe(localDay(day(2026, 9, 22)));
  });

  it('digests differ per install key, so a dictionary of domains cannot be checked against the file', () => {
    const a = createHostFirstSeenStore({ directory: dir, cipher });
    a.note('github.com');
    a.flush();
    const first = Object.keys((JSON.parse(readFileSync(join(dir, HOSTS_SEEN_FILE), 'utf8')) as { hosts: object }).hosts);
    a.clear();
    a.note('github.com');
    a.flush();
    const second = Object.keys((JSON.parse(readFileSync(join(dir, HOSTS_SEEN_FILE), 'utf8')) as { hosts: object }).hosts);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0]).not.toBe(first[0]);
  });

  it('writes nothing without a cipher that can encrypt — memory only', () => {
    const none = createHostFirstSeenStore({ directory: dir });
    none.note('a.example');
    none.flush();
    const off = createHostFirstSeenStore({ directory: dir, cipher: { ...cipher, isEncryptionAvailable: () => false } });
    off.note('b.example');
    off.flush();
    expect(existsSync(join(dir, HOSTS_SEEN_FILE))).toBe(false);
    expect(none.firstSeen('a.example')).toBeDefined();
  });

  it('clear() forgets every host and deletes the file', () => {
    const store = createHostFirstSeenStore({ directory: dir, cipher });
    store.note('a.example');
    store.flush();
    store.clear();
    expect(existsSync(join(dir, HOSTS_SEEN_FILE))).toBe(false);
    expect(store.firstSeen('a.example')).toBeUndefined();
  });

  it('evicts the oldest host past the cap', () => {
    const store = createHostFirstSeenStore();
    for (let i = 0; i <= HOSTS_SEEN_CAP; i += 1) store.note(`h${i}.example`);
    expect(store.firstSeen('h0.example')).toBeUndefined();
    expect(store.firstSeen(`h${HOSTS_SEEN_CAP}.example`)).toBeDefined();
  });

  it('starts empty on a corrupt file or a key the keychain cannot open', () => {
    const store = createHostFirstSeenStore({ directory: dir, cipher });
    store.note('x.example');
    store.flush();
    const file = join(dir, HOSTS_SEEN_FILE);
    const good = readFileSync(file, 'utf8');
    writeFileSync(file, good.replace(/"key":"[^"]+"/, `"key":"${Buffer.from('garbage').toString('base64')}"`));
    expect(createHostFirstSeenStore({ directory: dir, cipher }).firstSeen('x.example')).toBeUndefined();
    writeFileSync(file, '{nope');
    expect(createHostFirstSeenStore({ directory: dir, cipher }).firstSeen('x.example')).toBeUndefined();
  });

  it('localDay compares calendar days, not 24h windows', () => {
    expect(localDay(new Date(2026, 9, 22, 0, 1).getTime())).toBe(localDay(new Date(2026, 9, 22, 23, 59).getTime()));
    expect(localDay(new Date(2026, 9, 23, 0, 1).getTime())).toBe(localDay(new Date(2026, 9, 22, 23, 59).getTime()) + 1);
  });
});
