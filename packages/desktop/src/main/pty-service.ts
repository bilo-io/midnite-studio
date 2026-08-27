import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

import { EVENT_CHANNELS, SCROLLBACK_BYTES } from '@midnite/git-shared';
import type { BrowserWindow } from 'electron';

import type { AgentWatcher } from './agent-watcher';

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

type Session = {
  id: string;
  /** The durable row this process belongs to; the scrollback is filed under it. */
  sessionId: string;
  pty: IPty;
  /** Cleared once the shell's first output proves it is ready for input. */
  pendingInput: string | null;
};

/**
 * Who to tell about output, so the live-agent probe knows when to look.
 *
 * Injected rather than imported: `terminal-service.ts` already imports this
 * module for the scrollback, and the watcher needs the roster that lives behind
 * it — reaching for it from here would close the cycle. Absent by default, so
 * every test of this file that does not care about the probe gets no probe.
 */
let agentWatcher: AgentWatcher | null = null;

/** Wired once at boot, from `index.ts`. `null` disables live-agent detection. */
export function setAgentWatcher(watcher: AgentWatcher | null): void {
  agentWatcher = watcher;
}

const sessions = new Map<string, Session>();

/**
 * Output kept per session, keyed by *session* id rather than pty id.
 *
 * Reviving a restored session starts a new pty against the same row, and its
 * output has to land on the end of what is already there — otherwise pressing
 * Enter on a dead terminal wipes the history you revived it to read.
 */
const scrollbackBySession = new Map<string, Uint8Array>();

/**
 * Append to a session's buffer, keeping only the most recent bytes.
 *
 * A hard byte cap rather than a line count: the cost being bounded here is
 * memory and disk, and one `cat` of a minified bundle is a million characters on
 * three lines. Trimming to a line boundary is `trimScrollback`'s job, at the
 * point of writing the file — doing it on every chunk would cost a scan per
 * keystroke to save nothing.
 */
function appendScrollback(sessionId: string, chunk: Uint8Array): void {
  const previous = scrollbackBySession.get(sessionId) ?? new Uint8Array(0);
  const combined = new Uint8Array(previous.length + chunk.length);
  combined.set(previous, 0);
  combined.set(chunk, previous.length);

  // Keep a little slack above the cap so the newline-boundary trim at write
  // time has something to cut back to.
  const limit = SCROLLBACK_BYTES * 2;
  const kept = combined.length > limit ? combined.subarray(combined.length - limit) : combined;
  scrollbackBySession.set(sessionId, kept);
}

/** Everything a session has produced this launch, plus whatever it was restored with. */
export function readScrollback(sessionId: string): Uint8Array {
  return scrollbackBySession.get(sessionId) ?? new Uint8Array(0);
}

/** Seed a restored session's buffer so a revived pty appends rather than replaces. */
export function seedScrollback(sessionId: string, bytes: Uint8Array): void {
  scrollbackBySession.set(sessionId, bytes);
}

/** Every session id currently holding output, for the shutdown flush. */
export function scrollbackSessionIds(): string[] {
  return [...scrollbackBySession.keys()];
}

/** Drop a closed session's buffer — the record is gone, the memory should be too. */
export function dropScrollback(sessionId: string): void {
  scrollbackBySession.delete(sessionId);
}

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
  options: {
    sessionId: string;
    cwd: string;
    cols: number;
    rows: number;
    /**
     * The roster entry this session was opened for, when it was opened for one.
     *
     * Used for exactly one thing: seeding the live-agent watcher's last-known
     * value, so an agent session does not report having no agent for the few
     * hundred milliseconds between the shell starting and the command running.
     */
    agentId?: string | undefined;
    /** Typed in once the shell is up — see the deferred write in `onData` below. */
    initialInput?: string | undefined;
  },
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
      /**
       * Bytes cross as a Uint8Array via structured clone — no base64.
       *
       * node-pty hands us a JS string it decoded as UTF-8, and a multi-byte
       * character split across two reads would already be mangled by the time
       * we saw it. Encoding back to bytes here and letting xterm do the
       * decoding keeps the split-sequence handling in the one place that
       * actually implements it.
       */
      const bytes = new TextEncoder().encode(data);

      // Recorded before the window check: a session whose panel is hidden, or
      // whose window is going away, still has history worth restoring.
      appendScrollback(options.sessionId, bytes);

      /*
        Every chunk pushes the live-agent probe back. What it is waiting for is
        *silence*: an agent booting writes continuously and then stops at its
        prompt, which is the moment its process tree is worth reading.
      */
      agentWatcher?.noteOutput(id);

      /**
       * Send the agent's command only once the shell has spoken.
       *
       * Writing it at spawn time looks like it should work — a pty has an input
       * queue — but a login shell reads and discards pending input while it
       * sources the user's profile, and powerlevel10k's instant prompt does so
       * explicitly. The first output chunk is the shell saying it has a prompt
       * up and is listening.
       */
      const session = sessions.get(id);
      if (session?.pendingInput) {
        const input = session.pendingInput;
        session.pendingInput = null;
        try {
          child.write(input);
        } catch {
          // The shell died between printing a prompt and reading input.
        }
      }

      if (win.isDestroyed()) return;
      win.webContents.send(EVENT_CHANNELS.ptyData, { ptyId: id, data: bytes });
    });

    child.onExit(({ exitCode, signal }) => {
      sessions.delete(id);
      // Before the send: a pending probe against a dead pid would resolve
      // against whatever process inherited it, and the renderer drops the
      // session's whole runtime state on this event regardless.
      agentWatcher?.untrack(id);
      if (win.isDestroyed()) return;
      win.webContents.send(EVENT_CHANNELS.ptyExit, {
        ptyId: id,
        exitCode,
        ...(signal === undefined ? {} : { signal }),
      });
    });

    sessions.set(id, {
      id,
      sessionId: options.sessionId,
      pty: child,
      pendingInput: options.initialInput ?? null,
    });
    /*
      Seeded with what the session was OPENED for, and not probed here.

      At this instant the tree is a login shell and nothing else — the agent's
      command is typed in only once the shell prints a prompt (see the deferred
      write above). A probe now would answer "nothing running" for a session
      that is about to run one, and the row's mark would blink off and back on.
      The declared id is the honest starting assumption; the first quiet probe
      is what may contradict it.
    */
    agentWatcher?.track(id, child.pid, options.agentId ?? null);
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

/**
 * Kill a pty, leaving its session's scrollback intact.
 *
 * The row outlives the process — a killed terminal stays in the sidebar showing
 * what it printed. Only `terminal:forget` drops the buffer.
 */
export function killPty(ptyId: string): void {
  const session = sessions.get(ptyId);
  if (!session) return;
  sessions.delete(ptyId);
  agentWatcher?.untrack(ptyId);
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
