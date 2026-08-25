import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

import { EVENT_CHANNELS } from '@midnite/git-shared';
import type { BrowserWindow } from 'electron';

/**
 * The integrated terminal's backend.
 *
 * node-pty lives in the Electron **main** process only, which is the whole
 * reason this app has a simple native-module story: one ABI (Electron's), one
 * `electron-rebuild`, no staging a second build for a Node-ABI consumer.
 *
 * It is loaded lazily and fails soft. A broken native build is a real
 * possibility after an Electron upgrade, and the correct response is "terminal
 * unavailable" in one panel — not a main process that dies at boot and takes
 * the whole git client with it.
 */

type NodePtyModule = typeof import('node-pty');
type IPty = import('node-pty').IPty;

let nodePty: NodePtyModule | null = null;
let loadFailed: string | null = null;

function loadNodePty(): NodePtyModule | null {
  if (nodePty) return nodePty;
  if (loadFailed) return null;
  try {
    // A lazy require, not a static import: a static one resolves at module load,
    // so a broken native build would take the whole main process down at boot
    // instead of disabling one panel.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nodePty = require('node-pty') as NodePtyModule;
    return nodePty;
  } catch (error) {
    loadFailed = error instanceof Error ? error.message : 'node-pty failed to load';
    return null;
  }
}

/**
 * Does this pid name a live process?
 *
 * `kill(pid, 0)` sends no signal — it only probes existence and permission.
 * EPERM means alive but not ours; ESRCH means gone.
 */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

type Session = { id: string; pty: IPty };

const sessions = new Map<string, Session>();

/**
 * The shell to run, as a login shell.
 *
 * `-l` matters: a terminal that doesn't source the user's profile has a
 * different PATH, no aliases and no prompt from the one they use everywhere
 * else, which makes the integrated terminal feel like a lesser imitation. The
 * main process has already folded the login-shell PATH into its own env
 * (shell-path.ts), so the child inherits a correct PATH even before its profile
 * runs.
 */
function resolveShell(): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    return { file: process.env['COMSPEC'] ?? 'cmd.exe', args: [] };
  }
  const shell = process.env['SHELL'] ?? '/bin/zsh';
  return { file: existsSync(shell) ? shell : '/bin/sh', args: ['-l'] };
}

export type CreateResult = { ok: true; ptyId: string } | { ok: false; message: string };

export function createPty(
  win: BrowserWindow,
  options: { cwd: string; cols: number; rows: number },
): CreateResult {
  const pty = loadNodePty();
  if (!pty) {
    return {
      ok: false,
      message: `The terminal backend is unavailable (${loadFailed ?? 'node-pty not loaded'}).`,
    };
  }

  const { file, args } = resolveShell();
  const id = randomUUID();

  try {
    const child = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      env: {
        ...process.env,
        // Let a shell profile know it's us, the way VS Code does — some prompts
        // and tools key off it.
        TERM_PROGRAM: 'midnite-git',
        // Undo the read-path hygiene from git-exec: this is an interactive
        // shell, where the user genuinely may want git to prompt them.
        GIT_TERMINAL_PROMPT: '1',
      } as Record<string, string>,
    });

    child.onData((data) => {
      if (win.isDestroyed()) return;
      /**
       * Bytes cross as a Uint8Array via structured clone — no base64.
       *
       * node-pty hands us a JS string it decoded as UTF-8, and a multi-byte
       * character split across two reads would already be mangled by the time
       * we saw it. Encoding back to bytes here and letting xterm do the
       * decoding keeps the split-sequence handling in the one place that
       * actually implements it.
       */
      win.webContents.send(EVENT_CHANNELS.ptyData, {
        ptyId: id,
        data: new TextEncoder().encode(data),
      });
    });

    child.onExit(({ exitCode, signal }) => {
      sessions.delete(id);
      if (win.isDestroyed()) return;
      win.webContents.send(EVENT_CHANNELS.ptyExit, {
        ptyId: id,
        exitCode,
        ...(signal === undefined ? {} : { signal }),
      });
    });

    sessions.set(id, { id, pty: child });
    return { ok: true, ptyId: id };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not start a shell.',
    };
  }
}

export function writePty(ptyId: string, data: string): void {
  sessions.get(ptyId)?.pty.write(data);
}

export function resizePty(ptyId: string, cols: number, rows: number): void {
  const session = sessions.get(ptyId);
  if (!session) return;
  try {
    session.pty.resize(Math.max(1, cols), Math.max(1, rows));
  } catch {
    // The pty can exit between the renderer measuring and this call landing.
  }
}

export function killPty(ptyId: string): void {
  const session = sessions.get(ptyId);
  if (!session) return;
  sessions.delete(ptyId);
  try {
    session.pty.kill();
  } catch {
    // Already gone.
  }
}

/**
 * Kill every shell on shutdown.
 *
 * A pty is a child process, not a detached one: leaving them running would
 * orphan a shell per window per launch, and on macOS those survive the app
 * quitting entirely.
 */
export function killAllPtys(): void {
  for (const id of [...sessions.keys()]) killPty(id);
}

/** Live session count — used by the shutdown path and by tests. */
export const ptySessionCount = (): number => sessions.size;
