import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { isSocketPathTooLong } from '../broker/socket-name';
import { startMcpSocketServer, type McpSocketServerHandle } from '../mcp/socket-server';
import type { IterativeHost, ScopedDispatch } from './host';

/**
 * Private, per-run MCP servers for an app's in-app agent runs (Phase 113 Theme S slice 3) — the
 * `startServer` half of an `IterativeHost`. Each run gets a **fresh `0o700` directory** (`mkdtemp`) holding
 * one `0o600` socket, answering only that run's `dispatch`; closing the run stops the server and removes
 * the directory, so nothing listens beyond the run and nothing is left on disk.
 *
 * The directory sits under `baseDir` (an app's `<userData>/mcp-runs`, never the `mcp/` folder Studio's shim
 * scans for the global socket); when that path would be too long for a Unix socket it falls back to the
 * OS temp dir (per-user and private on macOS), rather than refusing the run.
 *
 * `closeAll()` is the synchronous teardown for quit: Electron does not wait on a promise in `before-quit`.
 */
export type RunServers = {
  startServer: IterativeHost['startServer'];
  /** Live runs right now (tests, diagnostics). */
  live: () => number;
  closeAll: () => void;
};

const SOCKET_NAME = 's.sock';

export function createRunServers(opts: { baseDir: string; log?: (line: string) => void; tempDir?: () => string }): RunServers {
  const live = new Map<string, McpSocketServerHandle>();
  const removeDir = (dir: string): void => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort: an emptied directory is harmless.
    }
  };

  /** A fresh private directory whose socket path fits, or null. */
  const freshDir = (): string | null => {
    for (const base of [opts.baseDir, (opts.tempDir ?? tmpdir)()]) {
      try {
        mkdirSync(base, { recursive: true, mode: 0o700 });
        const dir = mkdtempSync(join(base, 'r-'));
        if (!isSocketPathTooLong(join(dir, SOCKET_NAME))) return dir;
        removeDir(dir);
      } catch {
        // Try the next base.
      }
    }
    return null;
  };

  async function startServer({ dispatch }: { dispatch: ScopedDispatch }) {
    const dir = freshDir();
    if (!dir) return { ok: false as const, message: 'path too long for a Unix socket' };
    const started = await startMcpSocketServer({ socketPath: join(dir, SOCKET_NAME), dispatch, ...(opts.log ? { log: opts.log } : {}) });
    if (!started.ok) {
      removeDir(dir);
      return { ok: false as const, message: started.message };
    }
    const { handle } = started;
    live.set(dir, handle);
    const close = async (): Promise<void> => {
      if (!live.delete(dir)) return;
      await handle.close();
      removeDir(dir);
    };
    return { ok: true as const, socketPath: handle.socketPath, close };
  }

  return {
    startServer,
    live: () => live.size,
    closeAll() {
      for (const [dir, handle] of live) {
        handle.closeNow();
        removeDir(dir);
      }
      live.clear();
    },
  };
}
