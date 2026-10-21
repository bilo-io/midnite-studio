// @vitest-environment node
// vitest: the token and settings files under a temp data dir.
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEFAULT_LIBRARY_LAN_SETTINGS } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createLanSettingsStore,
  createLanTokenStore,
  LAN_SETTINGS_FILE,
  LAN_TOKEN_FILE,
} from './lan-store';

let dir: string;
beforeEach(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'mlib-lan-store-')));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('lan token store', () => {
  it('mints 256 bits once, owner-only, and keeps it across loads', async () => {
    const store = createLanTokenStore(dir);
    const token = await store.token();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect((await stat(join(dir, LAN_TOKEN_FILE))).mode & 0o777).toBe(0o600);
    expect(await createLanTokenStore(dir).token()).toBe(token);
  });

  it('matches only the current token; regenerate invalidates the old one', async () => {
    const store = createLanTokenStore(dir);
    const first = await store.token();
    expect(await store.matches(first)).toBe(true);
    for (const wrong of [null, '', first.slice(1), `${first}x`, first.toUpperCase()])
      expect(await store.matches(wrong)).toBe(false);
    const second = await store.regenerate();
    expect(second).not.toBe(first);
    expect(await store.matches(first)).toBe(false);
    expect(await store.matches(second)).toBe(true);
    expect((await readFile(join(dir, LAN_TOKEN_FILE), 'utf8')).trim()).toBe(second);
  });

  it('replaces a malformed token file rather than trusting it', async () => {
    await writeFile(join(dir, LAN_TOKEN_FILE), 'short');
    const token = await createLanTokenStore(dir).token();
    expect(token).not.toBe('short');
    expect(token).toHaveLength(43);
  });
});

describe('lan settings store', () => {
  it('defaults to off and persists a patch', async () => {
    const store = createLanSettingsStore(dir);
    expect(await store.read()).toEqual(DEFAULT_LIBRARY_LAN_SETTINGS);
    await store.update({ address: '192.168.1.20', startWithApp: true });
    const saved = JSON.parse(await readFile(join(dir, LAN_SETTINGS_FILE), 'utf8'));
    expect(saved).toMatchObject({ address: '192.168.1.20', startWithApp: true, wasOn: false });
    expect(await createLanSettingsStore(dir).read()).toMatchObject({ address: '192.168.1.20' });
  });

  it('reads an unreadable file as the defaults', async () => {
    await writeFile(join(dir, LAN_SETTINGS_FILE), '{not json');
    expect(await createLanSettingsStore(dir).read()).toEqual(DEFAULT_LIBRARY_LAN_SETTINGS);
  });
});
