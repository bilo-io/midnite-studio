import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createMcpStore } from '../mcp-store';
import { getMcpServerHandle, getMcpStatus, registerMcpServer, resetMcpServerStateForTests, setMcpEnabled } from './index';

let dirs: string[] = [];

const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'mstudio-mcp-index-'));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  const handle = getMcpServerHandle();
  if (handle) await handle.close();
  resetMcpServerStateForTests();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

describe('registerMcpServer', () => {
  it('does not bind a socket while the store says disabled (the default)', async () => {
    const handle = await registerMcpServer({
      userDataDir: tempDir(),
      appVersion: '0.0.0-test',
      buildId: 'test',
      isPackaged: false,
    });
    expect(handle).toBeNull();
    expect(getMcpStatus()).toMatchObject({ enabled: false, running: false, socketPath: null });
  });

  it('binds a socket when the store says enabled', async () => {
    const userDataDir = tempDir();
    await createMcpStore(userDataDir).save({ version: 1, enabled: true });

    const handle = await registerMcpServer({
      userDataDir,
      appVersion: '0.0.0-test',
      buildId: 'test',
      isPackaged: false,
    });
    expect(handle).not.toBeNull();
    expect(getMcpStatus()).toMatchObject({ enabled: true, running: true, socketPath: handle?.socketPath });
  });
});

describe('setMcpEnabled', () => {
  it('persists before acting, and starts the server live with no restart', async () => {
    const userDataDir = tempDir();
    const handle = await registerMcpServer({
      userDataDir,
      appVersion: '0.0.0-test',
      buildId: 'test',
      isPackaged: false,
    });
    expect(handle).toBeNull(); // off by default

    const result = await setMcpEnabled(true);
    expect(result.ok).toBe(true);
    expect(result.ok && result.status.running).toBe(true);
    expect(getMcpServerHandle()).not.toBeNull();

    // Persisted, not just in memory.
    expect(await createMcpStore(userDataDir).load()).toEqual({ version: 1, enabled: true });
  });

  it('stops the server live when turned off, and persists the flag', async () => {
    const userDataDir = tempDir();
    await createMcpStore(userDataDir).save({ version: 1, enabled: true });
    await registerMcpServer({
      userDataDir,
      appVersion: '0.0.0-test',
      buildId: 'test',
      isPackaged: false,
    });
    expect(getMcpServerHandle()).not.toBeNull();

    const result = await setMcpEnabled(false);
    expect(result.ok).toBe(true);
    expect(result.ok && result.status.running).toBe(false);
    expect(getMcpServerHandle()).toBeNull();
    expect(await createMcpStore(userDataDir).load()).toEqual({ version: 1, enabled: false });
  });

  it('answers ok:false without touching bootOpts before registerMcpServer has run', async () => {
    const result = await setMcpEnabled(true);
    expect(result.ok).toBe(false);
  });
});
