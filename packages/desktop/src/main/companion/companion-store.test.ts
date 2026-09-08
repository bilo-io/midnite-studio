import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  COMPANION_MARK_CAP,
  createCompanionStore,
  nullCompanionStore,
  parseStoredSettings,
} from './companion-store';

let dirs: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'ms-companion-'));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  dirs = [];
});

describe('createCompanionStore', () => {
  it('reports no mark for a repo it has never greeted', async () => {
    const store = createCompanionStore(await tempDir());
    expect(await store.lastGreeted('r1')).toBeNull();
  });

  it('round-trips a mark through the file', async () => {
    const dir = await tempDir();
    await createCompanionStore(dir).markGreeted('r1', 1_700_000_000_000);
    // A second store over the same directory, so this is the FILE answering.
    expect(await createCompanionStore(dir).lastGreeted('r1')).toBe(1_700_000_000_000);
  });

  it('writes to companion.json, beside mcp.json', async () => {
    const dir = await tempDir();
    await createCompanionStore(dir).markGreeted('r1', 5);
    const raw = JSON.parse(await readFile(join(dir, 'companion.json'), 'utf8'));
    expect(raw).toEqual({ version: 1, lastGreeted: { r1: 5 } });
  });

  it('keeps marks per repo', async () => {
    const dir = await tempDir();
    const store = createCompanionStore(dir);
    await store.markGreeted('r1', 10);
    await store.markGreeted('r2', 20);
    expect(await store.lastGreeted('r1')).toBe(10);
    expect(await store.lastGreeted('r2')).toBe(20);
  });

  it('never walks a mark backwards', async () => {
    const dir = await tempDir();
    const store = createCompanionStore(dir);
    await store.markGreeted('r1', 100);
    await store.markGreeted('r1', 50);
    expect(await store.lastGreeted('r1')).toBe(100);
  });

  it('caps how many repos it remembers, dropping the oldest', async () => {
    const dir = await tempDir();
    const store = createCompanionStore(dir);
    for (let i = 0; i < COMPANION_MARK_CAP + 5; i += 1) {
      await store.markGreeted(`r${i}`, 1000 + i);
    }
    const settings = await store.load();
    expect(Object.keys(settings.lastGreeted)).toHaveLength(COMPANION_MARK_CAP);
    // The five oldest are gone; the newest survived.
    expect(settings.lastGreeted.r0).toBeUndefined();
    expect(settings.lastGreeted[`r${COMPANION_MARK_CAP + 4}`]).toBe(1000 + COMPANION_MARK_CAP + 4);
  });

  it('loads the safe default from a corrupt file rather than throwing', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'companion.json'), '{ not json', 'utf8');
    expect(await createCompanionStore(dir).load()).toEqual({ version: 1, lastGreeted: {} });
  });

  it('does not take the app down when the directory is unwritable', async () => {
    const store = createCompanionStore('/definitely/not/a/directory');
    await expect(store.markGreeted('r1', 1)).resolves.toBeUndefined();
  });
});

describe('parseStoredSettings', () => {
  it('drops a non-numeric or negative mark rather than coercing it', () => {
    const parsed = parseStoredSettings({
      version: 1,
      lastGreeted: { a: 5, b: 'nope', c: null, d: Number.NaN, e: -1, f: Number.POSITIVE_INFINITY },
    });
    expect(parsed.lastGreeted).toEqual({ a: 5 });
  });

  it('answers the default for anything that is not an object', () => {
    for (const value of [null, 3, 'x', [], undefined]) {
      expect(parseStoredSettings(value)).toEqual({ version: 1, lastGreeted: {} });
    }
  });

  it('answers the default when `lastGreeted` is missing or the wrong type', () => {
    expect(parseStoredSettings({ version: 1 })).toEqual({ version: 1, lastGreeted: {} });
    expect(parseStoredSettings({ version: 1, lastGreeted: 'nope' })).toEqual({
      version: 1,
      lastGreeted: {},
    });
  });
});

describe('nullCompanionStore', () => {
  it('never remembers a greeting', async () => {
    await nullCompanionStore.markGreeted('r1', 1);
    expect(await nullCompanionStore.lastGreeted('r1')).toBeNull();
  });
});
