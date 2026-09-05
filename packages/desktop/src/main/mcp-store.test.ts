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
    expect(await createMcpStore(await tempDir()).load()).toEqual({ version: 1, enabled: false });
  });

  it('round-trips the enabled flag', async () => {
    const store = createMcpStore(await tempDir());
    await store.save({ version: 1, enabled: true });
    expect(await store.load()).toEqual({ version: 1, enabled: true });
  });

  it('loads disabled from a corrupt file rather than failing boot', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'mcp.json'), '{ not json', 'utf8');
    expect(await createMcpStore(dir).load()).toEqual({ version: 1, enabled: false });
  });

  it('swallows a write to an unwritable directory', async () => {
    const store = createMcpStore('/proc/definitely-not-writable');
    await expect(store.save({ version: 1, enabled: true })).resolves.toBeUndefined();
  });

  it('writes a versioned document', async () => {
    const dir = await tempDir();
    await createMcpStore(dir).save({ version: 1, enabled: true });
    const raw: unknown = JSON.parse(await readFile(join(dir, 'mcp.json'), 'utf8'));
    expect(raw).toEqual({ version: 1, enabled: true });
  });
});

describe('parseStoredSettings', () => {
  it('defaults to disabled for anything malformed', () => {
    expect(parseStoredSettings(null)).toEqual({ version: 1, enabled: false });
    expect(parseStoredSettings([])).toEqual({ version: 1, enabled: false });
    expect(parseStoredSettings({ enabled: 'yes' })).toEqual({ version: 1, enabled: false });
  });

  it('reads a real enabled flag', () => {
    expect(parseStoredSettings({ version: 1, enabled: true })).toEqual({ version: 1, enabled: true });
  });
});
