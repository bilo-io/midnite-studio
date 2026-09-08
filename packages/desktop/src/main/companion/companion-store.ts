import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * `companion.json` under `userData` — the per-repo "last greeted" mark
 * (Phase 79, Decision 11).
 *
 * **Main-side, not `localStorage`.** The mark is what sets the digest window:
 * "what landed since I last told you about this repo". A renderer store would
 * lose it to a cleared profile, a hard reload of a fresh install, or a second
 * window, and the failure mode is silent and wrong — the companion would
 * cheerfully re-read a week of history it already narrated, or (worse, after
 * a partial clear) narrate nothing at all.
 *
 * `mcp-store.ts` is the crib, line for line, and for its stated reasons: a
 * versioned JSON file, no `electron` import so this stays testable against a
 * temp directory, and a corrupt file loads the safe default rather than
 * throwing. The safe default here is "never greeted", which the digest turns
 * into its own seven-day fallback — the same answer a first launch gets.
 */
export type CompanionSettings = {
  version: 1;
  /**
   * Repo id → epoch milliseconds of the last greeting.
   *
   * Keyed by the repo *id* the registry assigns, not by path: a checkout that
   * moves keeps its id, and two linked worktrees of one repository share a
   * digest window because they share a history.
   */
  lastGreeted: Record<string, number>;
};

export type CompanionStore = {
  load: () => Promise<CompanionSettings>;
  /** The mark for one repo, or `null` for a repo this profile has never greeted. */
  lastGreeted: (repoId: string) => Promise<number | null>;
  /** Move one repo's mark forward. Never backwards — see the implementation. */
  markGreeted: (repoId: string, at: number) => Promise<void>;
};

const FILE_NAME = 'companion.json';

export const DEFAULT_COMPANION_SETTINGS: CompanionSettings = { version: 1, lastGreeted: {} };

/**
 * How many repos' marks the file keeps.
 *
 * A mark is a number keyed by a repo id, so this is theoretical rather than
 * real — but the file is rewritten on every greeting, and an unbounded map of
 * ids for repositories the user closed years ago has no reader. Oldest marks
 * are dropped first, which is also the right eviction: a repo you have not
 * greeted in the longest is the one whose window matters least.
 */
export const COMPANION_MARK_CAP = 200;

export function createCompanionStore(directory: string): CompanionStore {
  const file = join(directory, FILE_NAME);

  const load = async (): Promise<CompanionSettings> => {
    try {
      return parseStoredSettings(JSON.parse(await readFile(file, 'utf8')));
    } catch {
      // Missing (first launch) or unreadable/corrupt. "Never greeted" is the
      // safe default: the digest falls back to its seven-day window, which is
      // exactly what a first launch would have got anyway.
      return { version: 1, lastGreeted: {} };
    }
  };

  return {
    load,

    lastGreeted: async (repoId) => {
      const settings = await load();
      const at = settings.lastGreeted[repoId];
      return typeof at === 'number' ? at : null;
    },

    markGreeted: async (repoId, at) => {
      const settings = await load();
      const existing = settings.lastGreeted[repoId];
      /*
        Monotonic on purpose. Two windows greeting the same repo, or a
        caller passing an explicit `since` for a narrower window, must not be
        able to walk the mark backwards — that would re-narrate history the
        user has already heard. A clock that jumped backwards has the same
        shape and gets the same answer.
      */
      if (typeof existing === 'number' && existing >= at) return;

      const next = { ...settings.lastGreeted, [repoId]: at };
      const trimmed = Object.entries(next)
        .sort(([, a], [, b]) => b - a)
        .slice(0, COMPANION_MARK_CAP);

      try {
        await writeFile(
          file,
          `${JSON.stringify({ version: 1, lastGreeted: Object.fromEntries(trimmed) }, null, 2)}\n`,
          'utf8',
        );
      } catch {
        // A read-only data dir shouldn't take the app down; the mark just
        // won't survive the next launch, and the digest falls back to its
        // seven-day window.
      }
    },
  };
}

/**
 * Validate without zod: this module is main-only and the shape is one record
 * of numbers, matching `mcp-store.ts`'s own reasoning for a hand-rolled
 * guard. Anything that is not a finite non-negative number is dropped rather
 * than coerced — a `NaN` mark reaching the digest would produce a window
 * whose every comparison is false, and so a digest that silently says nothing
 * happened.
 */
export function parseStoredSettings(value: unknown): CompanionSettings {
  if (typeof value !== 'object' || value === null) return { version: 1, lastGreeted: {} };
  const raw = (value as { lastGreeted?: unknown }).lastGreeted;
  if (typeof raw !== 'object' || raw === null) return { version: 1, lastGreeted: {} };

  const lastGreeted: Record<string, number> = {};
  for (const [repoId, at] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof at === 'number' && Number.isFinite(at) && at >= 0) lastGreeted[repoId] = at;
  }
  return { version: 1, lastGreeted };
}

/** A store that never remembers a greeting — the fallback before one is configured. */
export const nullCompanionStore: CompanionStore = {
  load: async () => ({ version: 1, lastGreeted: {} }),
  lastGreeted: async () => null,
  markGreeted: async () => {},
};
