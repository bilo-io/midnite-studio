import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createMcpStore, parseStoredSettings } from './mcp-store';

let dirs: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mstudio-mcp-store-'));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs = [];
});

describe('createMcpStore', () => {
  it('loads disabled on a fresh directory', async () => {
    expect(await createMcpStore(await tempDir()).load()).toEqual({
      version: 7,
      enabled: false,
      allowUi: false,
      allowGateDecide: false, allowModels: false, allowGames: false, allowTerrains: false, allowSprites: false,
    });
  });

  it('round-trips the enabled flag, allowUi and allowGateDecide together', async () => {
    const store = createMcpStore(await tempDir());
    await store.save({ version: 7, enabled: true, allowUi: true, allowGateDecide: true, allowModels: false, allowGames: false, allowTerrains: false, allowSprites: false });
    expect(await store.load()).toEqual({ version: 7, enabled: true, allowUi: true, allowGateDecide: true, allowModels: false, allowGames: false, allowTerrains: false, allowSprites: false });
  });

  it('loads disabled from a corrupt file rather than failing boot', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'mcp.json'), '{ not json', 'utf8');
    expect(await createMcpStore(dir).load()).toEqual({
      version: 7,
      enabled: false,
      allowUi: false,
      allowGateDecide: false, allowModels: false, allowGames: false, allowTerrains: false, allowSprites: false,
    });
  });

  it('swallows a write to an unwritable directory', async () => {
    const store = createMcpStore('/proc/definitely-not-writable');
    await expect(
      store.save({ version: 7, enabled: true, allowUi: false, allowGateDecide: false, allowModels: false, allowGames: false, allowTerrains: false, allowSprites: false }),
    ).resolves.toBeUndefined();
  });

  it('writes a versioned document', async () => {
    const dir = await tempDir();
    await createMcpStore(dir).save({ version: 7, enabled: true, allowUi: false, allowGateDecide: true, allowModels: false, allowGames: false, allowTerrains: false, allowSprites: false });
    const raw: unknown = JSON.parse(await readFile(join(dir, 'mcp.json'), 'utf8'));
    expect(raw).toEqual({ version: 7, enabled: true, allowUi: false, allowGateDecide: true, allowModels: false, allowGames: false, allowTerrains: false, allowSprites: false });
  });

  /** Phase 81 Theme F's own acceptance condition. */
  it('reading a version-1 file on disk migrates it to version 3 with allowUi/allowGateDecide false', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'mcp.json'), JSON.stringify({ version: 1, enabled: true }), 'utf8');
    expect(await createMcpStore(dir).load()).toEqual({
      version: 7,
      enabled: true,
      allowUi: false,
      allowGateDecide: false, allowModels: false, allowGames: false, allowTerrains: false, allowSprites: false,
    });
  });

  /** Phase 97 Theme D's own acceptance condition. */
  it('reading a version-4 file (no allowGames key) migrates to allowGames: false', () => {
    expect(parseStoredSettings({ version: 4, enabled: true, allowUi: true, allowGateDecide: true, allowModels: true })).toEqual({
      version: 7, enabled: true, allowUi: true, allowGateDecide: true, allowModels: true, allowGames: false, allowTerrains: false, allowSprites: false,
    });
    expect(parseStoredSettings({ version: 7, enabled: true, allowGames: true }).allowGames).toBe(true);
  });

  it('reading a version-6 file (no allowSprites key) loads with allowSprites: false', () => {
    expect(parseStoredSettings({ version: 6, enabled: true, allowTerrains: true })).toMatchObject({ version: 7, allowTerrains: true, allowSprites: false });
    expect(parseStoredSettings({ version: 7, enabled: true, allowSprites: true }).allowSprites).toBe(true);
  });

  it('reading a version-5 file (no allowTerrains key) loads with allowTerrains: false', () => {
    expect(parseStoredSettings({ version: 5, enabled: true, allowGames: true })).toMatchObject({ version: 7, allowGames: true, allowTerrains: false, allowSprites: false });
    expect(parseStoredSettings({ version: 7, enabled: true, allowTerrains: true }).allowTerrains).toBe(true);
  });

  it('reading a version-2 file (allowUi, no allowGateDecide key at all) migrates to allowGateDecide: false, allowModels: false', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'mcp.json'), JSON.stringify({ version: 2, enabled: true, allowUi: true }), 'utf8');
    expect(await createMcpStore(dir).load()).toEqual({
      version: 7,
      enabled: true,
      allowUi: true,
      allowGateDecide: false, allowModels: false, allowGames: false, allowTerrains: false, allowSprites: false,
    });
  });
});

describe('parseStoredSettings', () => {
  it('defaults to disabled for anything malformed', () => {
    expect(parseStoredSettings(null)).toEqual({ version: 7, enabled: false, allowUi: false, allowGateDecide: false, allowModels: false, allowGames: false, allowTerrains: false, allowSprites: false });
    expect(parseStoredSettings([])).toEqual({ version: 7, enabled: false, allowUi: false, allowGateDecide: false, allowModels: false, allowGames: false, allowTerrains: false, allowSprites: false });
    expect(parseStoredSettings({ enabled: 'yes' })).toEqual({
      version: 7,
      enabled: false,
      allowUi: false,
      allowGateDecide: false, allowModels: false, allowGames: false, allowTerrains: false, allowSprites: false,
    });
  });

  it('reads a real enabled flag', () => {
    expect(parseStoredSettings({ version: 7, enabled: true, allowUi: false, allowGateDecide: false, allowModels: false, allowGames: false, allowTerrains: false, allowSprites: false })).toEqual({
      version: 7,
      enabled: true,
      allowUi: false,
      allowGateDecide: false, allowModels: false, allowGames: false, allowTerrains: false, allowSprites: false,
    });
  });

  it('reads real allowUi and allowGateDecide flags', () => {
    expect(parseStoredSettings({ version: 7, enabled: true, allowUi: true, allowGateDecide: true, allowModels: false, allowGames: false, allowTerrains: false, allowSprites: false })).toEqual({
      version: 7,
      enabled: true,
      allowUi: true,
      allowGateDecide: true, allowModels: false, allowGames: false, allowTerrains: false, allowSprites: false,
    });
  });

  it('migrates a version-1 object (no allowUi/allowGateDecide keys at all) to both false', () => {
    expect(parseStoredSettings({ version: 1, enabled: true })).toEqual({
      version: 7,
      enabled: true,
      allowUi: false,
      allowGateDecide: false, allowModels: false, allowGames: false, allowTerrains: false, allowSprites: false,
    });
  });

  it('migrates a version-2 object (allowUi, no allowGateDecide key at all) to allowGateDecide: false, allowModels: false', () => {
    expect(parseStoredSettings({ version: 2, enabled: true, allowUi: true })).toEqual({
      version: 7,
      enabled: true,
      allowUi: true,
      allowGateDecide: false, allowModels: false, allowGames: false, allowTerrains: false, allowSprites: false,
    });
  });
});
