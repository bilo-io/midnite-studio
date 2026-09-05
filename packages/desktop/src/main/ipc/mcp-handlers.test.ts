import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHANNELS } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

// `vi.hoisted` because vitest lifts `vi.mock` above the imports — same shape
// as `optimizer-handlers.test.ts`'s own `ipcMain.handle` capture.
const { handle } = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle } }));

import { getMcpServerHandle, registerMcpServer, resetMcpServerStateForTests } from '../mcp';
import { recordMcpCall, resetMcpCallLog } from '../mcp/audit';
import { registerMcpHandlers } from './mcp-handlers';

/** The `ipcMain.handle` listener main registered for `channel`, invoked the way `ipcRenderer.invoke` would. */
function invoke(channel: string, raw?: unknown): unknown {
  const [, listener] = handle.mock.calls.find(([ch]) => ch === channel) ?? [];
  if (typeof listener !== 'function') throw new Error(`no handler registered for ${channel}`);
  return listener({}, raw);
}

let dirs: string[] = [];

const tempDir = (): string => {
  // Short prefix on purpose: this ends up as part of a Unix socket path
  // (`<dir>/mcp/<name>.sock`), and macOS's own `/var/folders/.../T/` prefix
  // already spends a good chunk of the 104-byte `sun_path` ceiling before this
  // adds anything.
  const dir = mkdtempSync(join(tmpdir(), 'ms-mcph-'));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  const server = getMcpServerHandle();
  if (server) await server.close();
  resetMcpServerStateForTests();
  resetMcpCallLog();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
  handle.mockClear();
});

describe('registerMcpHandlers', () => {
  it('mcpGet answers the current status', async () => {
    await registerMcpServer({
      userDataDir: tempDir(),
      appVersion: '0.0.0-test',
      buildId: 'test',
      isPackaged: false,
    });
    registerMcpHandlers();

    expect(await invoke(CHANNELS.mcpGet)).toMatchObject({
      enabled: false,
      running: false,
      socketPath: null,
    });
  });

  it('mcpSet turns the server on live and reports it running', async () => {
    await registerMcpServer({
      userDataDir: tempDir(),
      appVersion: '0.0.0-test',
      buildId: 'test',
      isPackaged: false,
    });
    registerMcpHandlers();

    const response = (await invoke(CHANNELS.mcpSet, { enabled: true })) as {
      enabled: boolean;
      running: boolean;
      socketPath: string | null;
    };
    expect(response.enabled).toBe(true);
    expect(response.running).toBe(true);
    expect(response.socketPath).not.toBeNull();
    expect(getMcpServerHandle()).not.toBeNull();
  });

  it('mcpCalls answers the audit ring, newest first', async () => {
    await registerMcpServer({
      userDataDir: tempDir(),
      appVersion: '0.0.0-test',
      buildId: 'test',
      isPackaged: false,
    });
    registerMcpHandlers();

    recordMcpCall({ at: 1, tool: 'repo.list', repoPath: '', ok: true, ms: 3 });
    recordMcpCall({ at: 2, tool: 'status.get', repoPath: '/x', ok: true, ms: 4 });

    const response = (await invoke(CHANNELS.mcpCalls)) as { calls: { tool: string }[] };
    expect(response.calls.map((c) => c.tool)).toEqual(['status.get', 'repo.list']);
  });
});
