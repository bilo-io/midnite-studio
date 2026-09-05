import { lstat } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';

import type { OptimizerVoidResult, TrashSummary } from '@midnite/studio-shared';

import { defaultLogger, type Logger } from './log';
import { dirBytes, MAX_WALK_ENTRIES, newWalkState, readDirSafe } from './optimizer/scan-service';
import { runProcess, type ProcessSink, type RunProcessDeps, type SpawnFn } from './process-runner';

/**
 * The Trash (Phase 74 Themes B, C) — computing an honest summary of what is
 * in it, and asking Finder to empty it. Deliberately not under `optimizer/`:
 * emptying the Trash is not a cache-cleaning operation, and the two should
 * never become easy to confuse at a call site.
 *
 * **This file never issues a permanent-delete syscall.** `computeTrashSummary`
 * is read-only; `emptyTrash` asks Finder to do it via `osascript`, exactly the
 * way its own "Empty Trash" menu item would. No raw filesystem delete and no
 * Electron trash helper appears anywhere below — see `trash-service.test.ts`'s
 * grep-level assertion of that fact.
 */

export type ComputeTrashSummaryOptions = {
  signal: AbortSignal;
  /** Defaults to `os.homedir()`. Injected by the spec, never by IPC. */
  home?: string;
  /** Defaults to `'/Volumes'`. Injected by the spec, never by IPC. */
  volumesDir?: string;
  /** Defaults to `os.userInfo().uid`. Injected by the spec, never by IPC. */
  uid?: number;
  log?: Logger;
};

const EMPTY_SUMMARY: TrashSummary = {
  itemCount: 0,
  totalBytes: 0,
  oldestModifiedAt: null,
  volumeCount: 0,
  truncated: false,
};

/**
 * Sizes `~/.Trash` plus every mounted volume's own per-user Trash
 * (`/Volumes/<name>/.Trashes/<uid>`), sharing one entry budget across every
 * root so a single pathological root cannot be escaped by mounting a second
 * disk. Every override is spec-only: `optimizerTrashSummary` is a payload-free
 * `handleBare` channel, so there is no path from a renderer string to `home`,
 * `volumesDir` or `uid`.
 */
export async function computeTrashSummary(opts: ComputeTrashSummaryOptions): Promise<TrashSummary> {
  const { signal } = opts;
  if (signal.aborted) return EMPTY_SUMMARY;

  const home = opts.home ?? homedir();
  const volumesDir = opts.volumesDir ?? '/Volumes';
  const uid = opts.uid ?? userInfo().uid;
  const log = opts.log ?? defaultLogger;

  // Only a root that actually exists is walked and counted — a fresh account
  // has no `~/.Trash` at all, and that is an empty summary, not an error.
  const roots: string[] = [];
  const homeTrash = join(home, '.Trash');
  try {
    if ((await lstat(homeTrash)).isDirectory()) roots.push(homeTrash);
  } catch {
    // No ~/.Trash yet — excluded below, not an error.
  }

  // A shallow, one-level readdir — never recursive. macOS puts a symlink to
  // the boot volume in /Volumes (`/Volumes/Macintosh HD` → `/`); following it
  // would walk the entire startup disk and double-count `~/.Trash`.
  for (const entry of await readDirSafe(volumesDir, log)) {
    if (signal.aborted) break;
    if (entry.isSymbolicLink()) continue; // the boot-volume symlink, skipped

    const trashesRoot = join(volumesDir, entry.name, '.Trashes', String(uid));
    try {
      const stat = await lstat(trashesRoot);
      if (stat.isDirectory()) roots.push(trashesRoot);
    } catch {
      // No .Trashes, or none for this uid (another user's trash on a shared
      // disk) — excluded, not an error.
    }
  }

  if (roots.length === 0) return EMPTY_SUMMARY;

  const state = newWalkState();
  let itemCount = 0;
  let totalBytes = 0;
  let oldestModifiedAt: string | null = null;

  for (const root of roots) {
    if (signal.aborted) break;

    const entries = await readDirSafe(root, log);

    for (const entry of entries) {
      if (signal.aborted || state.entriesWalked >= MAX_WALK_ENTRIES) break;
      // Shared with `dirBytes`'s own internal count, so the 200,000-entry
      // budget is one budget for the whole summary, not per top-level entry.
      state.entriesWalked += 1;
      itemCount += 1;

      const full = join(root, entry.name);
      let mtimeIso: string | null = null;
      try {
        const stat = await lstat(full);
        mtimeIso = stat.mtime.toISOString();
        if (entry.isSymbolicLink()) {
          // Symlinks contribute zero bytes — dirBytes skips them the same way.
        } else if (entry.isDirectory()) {
          totalBytes += await dirBytes(full, state, signal, log);
        } else {
          totalBytes += stat.size;
        }
      } catch {
        // Vanished between readdir and lstat — skip rather than fail the pass.
        continue;
      }

      if (mtimeIso !== null && (oldestModifiedAt === null || mtimeIso < oldestModifiedAt)) {
        oldestModifiedAt = mtimeIso;
      }
    }
  }

  return {
    itemCount,
    totalBytes,
    oldestModifiedAt,
    volumeCount: roots.length,
    truncated: state.entriesWalked >= MAX_WALK_ENTRIES,
  };
}

export type EmptyTrashDeps = { spawn?: SpawnFn; timeoutMs?: number; log?: Logger };

const EMPTY_TRASH_COMMAND = 'osascript' as const;
export const EMPTY_TRASH_ARGS = ['-e', 'tell application "Finder" to empty trash'] as const;

/** AppleScript's own timeout for a Trash that can hold tens of gigabytes. */
const EMPTY_TRASH_TIMEOUT_MS = 10 * 60_000;

function bufferSink(): ProcessSink<string> {
  let buffer = '';
  return {
    push: (chunk) => {
      buffer += chunk;
    },
    finish: () => ({ ok: true, data: buffer }),
  };
}

/** One line, matched against `osascript`'s stderr, e.g. `execution error: ... (-1743)`. */
function mapAppleScriptError(stderr: string): string {
  if (stderr.includes('(-1743)')) {
    return "Midnite Studio isn't allowed to control Finder. Grant it in System Settings ▸ Privacy & Security ▸ Automation, then try again.";
  }
  if (stderr.includes('(-128)')) {
    return 'Cancelled in Finder — nothing was deleted.';
  }
  if (stderr.includes('(-600)') || stderr.includes('(-1728)')) {
    return "Finder didn't respond. Open Finder and try again.";
  }
  const firstLine = stderr
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return `Finder could not empty the Trash: ${firstLine ?? 'unknown error'}`;
}

/**
 * Asks Finder to empty the Trash — the one command in this whole file, run
 * through `runProcess` with a module-level, `as const` argv that never takes
 * any value from the renderer. Rejected alternative: walking `~/.Trash` (plus
 * discovered volumes) and issuing `fs.rm` per top-level entry, which would (a)
 * require this app's own code to issue a permanent-delete syscall, a property
 * it has never had, (b) reimplement Finder's own handling of locked/immutable/
 * in-use items, and (c) still need the same multi-volume discovery this file
 * already does, with none of Finder's guarantee that it knows about every
 * mounted volume's Trash.
 */
export async function emptyTrash(deps: EmptyTrashDeps = {}): Promise<OptimizerVoidResult> {
  const runDeps: RunProcessDeps<string> = {
    sink: bufferSink(),
    timeoutMs: deps.timeoutMs ?? EMPTY_TRASH_TIMEOUT_MS,
  };
  if (deps.spawn !== undefined) runDeps.spawn = deps.spawn;

  const outcome = await runProcess(EMPTY_TRASH_COMMAND, EMPTY_TRASH_ARGS, homedir(), runDeps);

  if (!outcome.ok) {
    if (outcome.reason === 'timed-out') {
      return {
        ok: false,
        message:
          'Finder is still emptying the Trash. Midnite Studio stopped waiting; it did not stop Finder — check the Trash in a moment.',
      };
    }
    return { ok: false, message: outcome.hint };
  }

  if (outcome.exitCode === 0) return { ok: true };

  return { ok: false, message: mapAppleScriptError(outcome.stderr) };
}
