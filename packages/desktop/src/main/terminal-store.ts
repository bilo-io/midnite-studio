import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { SCROLLBACK_BYTES, type TerminalSession } from '@midnite/studio-shared';

/**
 * Terminal sessions and their output, persisted across launches.
 *
 * Two files, because the two halves have nothing in common. `terminals.json` is
 * a short ordered list of rows — cheap to rewrite whole. `scrollback/<id>.bin`
 * is up to `SCROLLBACK_BYTES` of raw pty output per session, which has no
 * business being re-encoded through JSON on every keystroke.
 *
 * Deliberately *not* localStorage: a few hundred kilobytes per session would
 * blow the renderer's ~5 MB quota after a handful of terminals, and the record
 * should outlive a cleared browser store the same way `repos.json` does.
 *
 * As with `repo-store.ts`, the directory is injected rather than read from
 * `app.getPath('userData')`, so this module carries no `electron` import and
 * stays testable against a temp dir.
 */
export type TerminalStore = {
  load: () => Promise<TerminalSession[]>;
  save: (sessions: readonly TerminalSession[]) => Promise<void>;
  readScrollback: (sessionId: string) => Promise<Uint8Array>;
  writeScrollback: (sessionId: string, bytes: Uint8Array) => Promise<void>;
  forget: (sessionId: string) => Promise<void>;
};

type StoredState = { version: 1; sessions: TerminalSession[] };

const FILE_NAME = 'terminals.json';
const SCROLLBACK_DIR = 'scrollback';

export function createTerminalStore(directory: string): TerminalStore {
  const file = join(directory, FILE_NAME);
  const scrollbackDir = join(directory, SCROLLBACK_DIR);
  const logFile = (sessionId: string) => join(scrollbackDir, `${safeId(sessionId)}.bin`);

  return {
    load: async () => {
      try {
        return parseStoredSessions(JSON.parse(await readFile(file, 'utf8')));
      } catch {
        // Missing (first launch) or corrupt — start with no sessions rather
        // than failing boot over a list of terminals.
        return [];
      }
    },

    save: async (sessions) => {
      const state: StoredState = { version: 1, sessions: [...sessions] };
      try {
        await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      } catch {
        // A read-only data dir shouldn't take the app down.
      }
    },

    readScrollback: async (sessionId) => {
      try {
        return new Uint8Array(await readFile(logFile(sessionId)));
      } catch {
        return new Uint8Array(0);
      }
    },

    writeScrollback: async (sessionId, bytes) => {
      try {
        await mkdir(scrollbackDir, { recursive: true });
        await writeFile(logFile(sessionId), bytes);
      } catch {
        // Losing scrollback is a worse restore, not a broken app.
      }
    },

    forget: async (sessionId) => {
      try {
        await rm(logFile(sessionId), { force: true });
      } catch {
        // Already gone, or unlinkable — either way there is nothing to do.
      }
    },
  };
}

/**
 * Keep a session's id from escaping the scrollback directory.
 *
 * Ids are `randomUUID()` today, so this can never fire — but the id arrives over
 * IPC and is interpolated straight into a path, and "can never fire" is exactly
 * the assumption that a later feature (named sessions, imported sessions)
 * quietly invalidates.
 */
function safeId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Validate without zod, matching `repo-store.ts`: main-only, and a bad row
 * should be dropped rather than take the whole file down with it.
 */
export function parseStoredSessions(value: unknown): TerminalSession[] {
  if (typeof value !== 'object' || value === null) return [];
  const sessions = (value as { sessions?: unknown }).sessions;
  if (!Array.isArray(sessions)) return [];
  return sessions.filter(isSession);
}

function isSession(value: unknown): value is TerminalSession {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    s.id.length > 0 &&
    (s.kind === 'shell' || s.kind === 'agent') &&
    typeof s.title === 'string' &&
    typeof s.cwd === 'string' &&
    s.cwd.length > 0 &&
    typeof s.repoId === 'string' &&
    typeof s.createdAt === 'number' &&
    (s.agentId === undefined || typeof s.agentId === 'string')
  );
}

/**
 * Keep the last `SCROLLBACK_BYTES` of output, cut at a line boundary.
 *
 * The line boundary is the whole point. Slicing raw pty bytes at an arbitrary
 * offset lands mid-escape-sequence about as often as not, and replaying a
 * half-finished CSI leaves xterm parsing the rest of the buffer as parameters —
 * the visible symptom being a pane painted one solid colour, or the first
 * screenful swallowed. Cutting after a `\n` and prefixing the replay with a
 * reset means the worst case is losing one line, not the session.
 */
export function trimScrollback(bytes: Uint8Array, limit = SCROLLBACK_BYTES): Uint8Array {
  if (bytes.length <= limit) return bytes;

  const excess = bytes.length - limit;
  const start = lineStartAtOrAfter(bytes, excess);

  const reset = RESET_SEQUENCE;
  const out = new Uint8Array(reset.length + (bytes.length - start));
  out.set(reset, 0);
  out.set(bytes.subarray(start), reset.length);
  return out;
}

/**
 * The first offset at or after `from` that begins a line.
 *
 * "At or after" rather than "after": when the cut already lands on a line start,
 * scanning to the *next* newline throws away a whole extra line for nothing —
 * which at a 256 KB cap is invisible, but at the small limits the tests use is
 * the difference between keeping two lines and one.
 */
function lineStartAtOrAfter(bytes: Uint8Array, from: number): number {
  if (from === 0 || bytes[from - 1] === 0x0a) return from;

  const newline = bytes.indexOf(0x0a, from);
  // No newline in the tail at all (one very long line) — take the raw cut and
  // let the reset prefix sort out the colours.
  return newline === -1 ? from : newline + 1;
}

/** `ESC [ 0 m` — clears any SGR state the discarded prefix had set. */
const RESET_SEQUENCE = new Uint8Array([0x1b, 0x5b, 0x30, 0x6d]);

/** A store that remembers nothing — the fallback before one is configured. */
export const nullTerminalStore: TerminalStore = {
  load: async () => [],
  save: async () => {},
  readScrollback: async () => new Uint8Array(0),
  writeScrollback: async () => {},
  forget: async () => {},
};
