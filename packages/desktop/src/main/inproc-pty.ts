import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

import { SCROLLBACK_BYTES } from '@midnite/studio-shared';

import type { AgentWatcher } from './agent-watcher';

type NodePtyModule = typeof import('node-pty');
type IPty = import('node-pty').IPty;

let nodePty: NodePtyModule | null = null;
let loadFailed: string | null = null;

function loadNodePty(): NodePtyModule | null {
  if (nodePty) return nodePty;
  if (loadFailed) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nodePty = require('node-pty') as NodePtyModule;
    return nodePty;
  } catch (error) {
    loadFailed = error instanceof Error ? error.message : 'node-pty failed to load';
    return null;
  }
}

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
  sessionId: string;
  pty: IPty;
  pendingInput: string | null;
  cols: number;
  rows: number;
};

let agentWatcher: AgentWatcher | null = null;

export function setInprocAgentWatcher(watcher: AgentWatcher | null): void {
  agentWatcher = watcher;
}

const sessions = new Map<string, Session>();
const scrollbackBySession = new Map<string, Uint8Array>();

function appendScrollback(sessionId: string, chunk: Uint8Array): void {
  const previous = scrollbackBySession.get(sessionId) ?? new Uint8Array(0);
  const combined = new Uint8Array(previous.length + chunk.length);
  combined.set(previous, 0);
  combined.set(chunk, previous.length);

  const limit = SCROLLBACK_BYTES * 2;
  const kept = combined.length > limit ? combined.subarray(combined.length - limit) : combined;
  scrollbackBySession.set(sessionId, kept);
}

export function inprocReadScrollback(sessionId: string): Uint8Array {
  return scrollbackBySession.get(sessionId) ?? new Uint8Array(0);
}

export function inprocSeedScrollback(sessionId: string, bytes: Uint8Array): void {
  scrollbackBySession.set(sessionId, bytes);
}

export function inprocScrollbackSessionIds(): string[] {
  return [...scrollbackBySession.keys()];
}

export function inprocDropScrollback(sessionId: string): void {
  scrollbackBySession.delete(sessionId);
}

function resolveShell(): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    return { file: process.env['COMSPEC'] ?? 'cmd.exe', args: [] };
  }
  const shell = process.env['SHELL'] ?? '/bin/zsh';
  return { file: existsSync(shell) ? shell : '/bin/sh', args: ['-l'] };
}

export type InprocCreateResult = { ok: true; ptyId: string } | { ok: false; message: string };

export function inprocCreatePty(
  options: {
    sessionId: string;
    cwd: string;
    cols: number;
    rows: number;
    agentId?: string | undefined;
    initialInput?: string | undefined;
  },
  onData: (ptyId: string, bytes: Uint8Array) => void,
  onExit: (ptyId: string, exitCode: number, signal?: number | undefined) => void,
): InprocCreateResult {
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
        TERM_PROGRAM: 'midnite-studio',
        GIT_TERMINAL_PROMPT: '1',
      } as Record<string, string>,
    });

    child.onData((data) => {
      const bytes = new TextEncoder().encode(data);
      appendScrollback(options.sessionId, bytes);
      agentWatcher?.noteOutput(id);

      const session = sessions.get(id);
      if (session?.pendingInput) {
        const input = session.pendingInput;
        session.pendingInput = null;
        try {
          child.write(input);
        } catch {
          // Ignore
        }
      }

      onData(id, bytes);
    });

    child.onExit(({ exitCode, signal }) => {
      sessions.delete(id);
      agentWatcher?.untrack(id);
      onExit(id, exitCode, signal);
    });

    sessions.set(id, {
      id,
      sessionId: options.sessionId,
      pty: child,
      pendingInput: options.initialInput ?? null,
      cols: options.cols,
      rows: options.rows,
    });

    agentWatcher?.track(id, child.pid, options.agentId ?? null);
    return { ok: true, ptyId: id };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not start a shell.',
    };
  }
}

export function inprocWritePty(ptyId: string, data: string): void {
  sessions.get(ptyId)?.pty.write(data);
}

export function inprocResizePty(ptyId: string, cols: number, rows: number): void {
  const session = sessions.get(ptyId);
  if (!session) return;
  session.cols = Math.max(1, cols);
  session.rows = Math.max(1, rows);
  try {
    session.pty.resize(session.cols, session.rows);
  } catch {
    // Ignore
  }
}

export function inprocSessionIdFor(ptyId: string): string | undefined {
  return sessions.get(ptyId)?.sessionId;
}

export function inprocLivePtyFor(
  sessionId: string,
): { ptyId: string; pid: number; cols: number; rows: number; legacy: boolean } | null {
  for (const [ptyId, session] of sessions) {
    if (session.sessionId === sessionId) {
      // Inproc mode spawns only for this launch — there is no legacy peer.
      return { ptyId, pid: session.pty.pid, cols: session.cols, rows: session.rows, legacy: false };
    }
  }
  return null;
}

export function inprocKillPty(ptyId: string): void {
  const session = sessions.get(ptyId);
  if (!session) return;
  sessions.delete(ptyId);
  agentWatcher?.untrack(ptyId);
  try {
    session.pty.kill();
  } catch {
    // Already gone
  }
}

export function inprocKillAllPtys(): void {
  for (const id of [...sessions.keys()]) inprocKillPty(id);
}

export const inprocPtySessionCount = (): number => sessions.size;
