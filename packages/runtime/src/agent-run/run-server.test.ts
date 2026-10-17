// vitest, not Playwright: a real Unix socket in a temp dir, no app, no browser.
import { existsSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ScopedDispatch } from './host';
import { createRunServers } from './run-server';
import { callMcpSocket, RUN_SOCKET_GONE_MESSAGE } from './socket-call';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
const temp = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mrun-'));
  dirs.push(dir);
  return dir;
};

/** Answers `echo` and refuses everything else — a stand-in for a run's scoped dispatcher. */
const dispatch: ScopedDispatch = async (tool, input) =>
  tool === 'echo' ? { ok: true, value: input } : { ok: false, kind: 'error', message: `Unknown tool: "${tool}"` };

describe('createRunServers', () => {
  it('serves one run on a 0o600 socket in a fresh 0o700 directory, and removes both on close', async () => {
    const base = await temp();
    const servers = createRunServers({ baseDir: join(base, 'mcp-runs') });
    const started = await servers.startServer({ dispatch });
    if (!started.ok) throw new Error(started.message);
    expect(dirname(dirname(started.socketPath))).toBe(join(base, 'mcp-runs'));
    expect(statSync(dirname(started.socketPath)).mode & 0o777).toBe(0o700);
    expect(statSync(started.socketPath).mode & 0o777).toBe(0o600);
    expect(servers.live()).toBe(1);

    expect(await callMcpSocket({ socketPath: started.socketPath, tool: 'echo', input: { a: 1 }, timeoutMs: 5000 })).toMatchObject({ ok: true, value: { a: 1 } });
    expect(await callMcpSocket({ socketPath: started.socketPath, tool: 'repo_list', input: {}, timeoutMs: 5000 })).toMatchObject({ ok: false, message: 'Unknown tool: "repo_list"' });

    await started.close();
    expect(servers.live()).toBe(0);
    expect(existsSync(dirname(started.socketPath))).toBe(false);
    expect(await callMcpSocket({ socketPath: started.socketPath, tool: 'echo', input: {}, timeoutMs: 5000 })).toMatchObject({ ok: false, message: RUN_SOCKET_GONE_MESSAGE });
  });

  it('gives every run its own directory, and closeAll tears them all down synchronously', async () => {
    const servers = createRunServers({ baseDir: join(await temp(), 'mcp-runs') });
    const a = await servers.startServer({ dispatch });
    const b = await servers.startServer({ dispatch });
    if (!a.ok || !b.ok) throw new Error('did not start');
    expect(dirname(a.socketPath)).not.toBe(dirname(b.socketPath));
    servers.closeAll();
    expect(servers.live()).toBe(0);
    expect(existsSync(dirname(a.socketPath))).toBe(false);
    expect(existsSync(dirname(b.socketPath))).toBe(false);
  });

  it('falls back to the temp dir when the base would make the socket path too long', async () => {
    const fallback = await temp();
    const servers = createRunServers({ baseDir: join(await temp(), 'x'.repeat(120)), tempDir: () => fallback });
    const started = await servers.startServer({ dispatch });
    if (!started.ok) throw new Error(started.message);
    expect(dirname(dirname(started.socketPath))).toBe(fallback);
    await started.close();
  });
});
