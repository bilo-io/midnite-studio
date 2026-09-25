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
      version: 3,
      enabled: false,
      allowUi: false,
      allowGateDecide: false,
    });
  });

  it('round-trips the enabled flag, allowUi and allowGateDecide together', async () => {
    const store = createMcpStore(await tempDir());
    await store.save({ version: 3, enabled: true, allowUi: true, allowGateDecide: true });
    expect(await store.load()).toEqual({ version: 3, enabled: true, allowUi: true, allowGateDecide: true });
  });

  it('loads disabled from a corrupt file rather than failing boot', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'mcp.json'), '{ not json', 'utf8');
    expect(await createMcpStore(dir).load()).toEqual({
      version: 3,
      enabled: false,
      allowUi: false,
      allowGateDecide: false,
    });
  });

  it('swallows a write to an unwritable directory', async () => {
    const store = createMcpStore('/proc/definitely-not-writable');
    await expect(
      store.save({ version: 3, enabled: true, allowUi: false, allowGateDecide: false }),
    ).resolves.toBeUndefined();
  });

  it('writes a versioned document', async () => {
    const dir = await tempDir();
    await createMcpStore(dir).save({ version: 3, enabled: true, allowUi: false, allowGateDecide: true });
    const raw: unknown = JSON.parse(await readFile(join(dir, 'mcp.json'), 'utf8'));
    expect(raw).toEqual({ version: 3, enabled: true, allowUi: false, allowGateDecide: true });
  });

  /** Phase 81 Theme F's own acceptance condition. */
  it('reading a version-1 file on disk migrates it to version 3 with allowUi/allowGateDecide false', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'mcp.json'), JSON.stringify({ version: 1, enabled: true }), 'utf8');
    expect(await createMcpStore(dir).load()).toEqual({
      version: 3,
      enabled: true,
      allowUi: false,
      allowGateDecide: false,
    });
  });

  /** Phase 97 Theme D's own acceptance condition. */
  it('reading a version-2 file (allowUi, no allowGateDecide key at all) migrates to allowGateDecide: false', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'mcp.json'), JSON.stringify({ version: 2, enabled: true, allowUi: true }), 'utf8');
    expect(await createMcpStore(dir).load()).toEqual({
      version: 3,
      enabled: true,
      allowUi: true,
      allowGateDecide: false,
    });
  });
});

describe('parseStoredSettings', () => {
  it('defaults to disabled for anything malformed', () => {
    expect(parseStoredSettings(null)).toEqual({ version: 3, enabled: false, allowUi: false, allowGateDecide: false });
    expect(parseStoredSettings([])).toEqual({ version: 3, enabled: false, allowUi: false, allowGateDecide: false });
    expect(parseStoredSettings({ enabled: 'yes' })).toEqual({
      version: 3,
      enabled: false,
      allowUi: false,
      allowGateDecide: false,
    });
  });

  it('reads a real enabled flag', () => {
    expect(parseStoredSettings({ version: 3, enabled: true, allowUi: false, allowGateDecide: false })).toEqual({
      version: 3,
      enabled: true,
      allowUi: false,
      allowGateDecide: false,
    });
  });

  it('reads real allowUi and allowGateDecide flags', () => {
    expect(parseStoredSettings({ version: 3, enabled: true, allowUi: true, allowGateDecide: true })).toEqual({
      version: 3,
      enabled: true,
      allowUi: true,
      allowGateDecide: true,
    });
  });

  it('migrates a version-1 object (no allowUi/allowGateDecide keys at all) to both false', () => {
    expect(parseStoredSettings({ version: 1, enabled: true })).toEqual({
      version: 3,
      enabled: true,
      allowUi: false,
      allowGateDecide: false,
    });
  });

  it('migrates a version-2 object (allowUi, no allowGateDecide key at all) to allowGateDecide: false', () => {
    expect(parseStoredSettings({ version: 2, enabled: true, allowUi: true })).toEqual({
      version: 3,
      enabled: true,
      allowUi: true,
      allowGateDecide: false,
    });
  });
});
