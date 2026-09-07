import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * The frecency nudge Phase 23 Theme D owed (reopened at x1): a bounded score
 * multiplier that favours a palette item run recently and often, without
 * ever becoming the ranking itself.
 *
 * Deliberately its own tiny persisted slice — **not** a field on `ui-store`
 * (a 78-key blob is not where a per-item counter belongs) and **not** on
 * `store/palette-store.ts`, which stays unpersisted on purpose: an open
 * palette's query and selection are true only for one keypress-to-Escape
 * session, but *which commands you actually use* is exactly the kind of
 * thing worth remembering across restarts.
 */
export type FrecencyEntry = { count: number; lastAt: number };
export type FrecencyMap = Record<string, FrecencyEntry>;

/** Evicted once the map holds more distinct ids than this. */
export const MAX_FRECENCY_ENTRIES = 50;

/**
 * Half-life for the recency half of `count * recencyDecay`: a command run
 * once a week keeps most of its weight; one untouched for a month is most of
 * the way to gone. Exponential rather than linear so "yesterday" and "an
 * hour ago" read as nearly the same, while "last month" reads as nearly
 * nothing — the shape frecency is named for.
 */
const HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 7;

/** The bounded nudge's ceiling — never more than a quarter of an item's own score. */
const MAX_MULTIPLIER = 1.25;

/** `1` the instant a command runs, decaying toward `0` as `lastAt` recedes. */
export function recencyDecay(lastAt: number, now: number = Date.now()): number {
  const elapsedMs = Math.max(0, now - lastAt);
  return Math.pow(0.5, elapsedMs / HALF_LIFE_MS);
}

/** `count * recencyDecay(lastAt)` — the single number both ranking (nudge) and eviction (cap) key on. */
export function frecencyWeight(entry: FrecencyEntry, now: number = Date.now()): number {
  return entry.count * recencyDecay(entry.lastAt, now);
}

/**
 * Drops the lowest-`frecencyWeight` entries once `entries` holds more than
 * `MAX_FRECENCY_ENTRIES` distinct ids — capped at 50 keys, evicting the
 * lowest `count * recencyDecay` first, per the phase doc.
 */
export function evictLowestWeight(entries: FrecencyMap, now: number = Date.now()): FrecencyMap {
  const keys = Object.keys(entries);
  if (keys.length <= MAX_FRECENCY_ENTRIES) return entries;

  const overflow = keys.length - MAX_FRECENCY_ENTRIES;
  const toDrop = new Set(
    [...keys]
      .sort((a, b) => frecencyWeight(entries[a]!, now) - frecencyWeight(entries[b]!, now))
      .slice(0, overflow),
  );

  const next: FrecencyMap = {};
  for (const key of keys) {
    if (!toDrop.has(key)) next[key] = entries[key]!;
  }
  return next;
}

/** Bumps `id` — a fresh count of 1 and `lastAt: now` if it has never run before — then applies the cap. */
export function bumpFrecency(entries: FrecencyMap, id: string, now: number = Date.now()): FrecencyMap {
  const prev = entries[id];
  const next: FrecencyMap = { ...entries, [id]: { count: (prev?.count ?? 0) + 1, lastAt: now } };
  return evictLowestWeight(next, now);
}

/**
 * The nudge itself: a bounded multiplier (`1` to `MAX_MULTIPLIER`) on an
 * item's already-scored, already-source-weighted score — never a re-sort.
 * An id with no history at all (the common case — most commands are never
 * run from the palette) gets exactly `1`, so its ordering relative to every
 * other never-run item is unchanged.
 *
 * The curve saturates rather than growing unbounded with `count`: a command
 * run twice already captures most of the available nudge, and one run a
 * thousand times cannot out-multiply the ceiling every item shares.
 */
export function frecencyMultiplier(
  entries: FrecencyMap,
  id: string,
  now: number = Date.now(),
): number {
  const entry = entries[id];
  if (!entry) return 1;
  const weight = frecencyWeight(entry, now);
  const bonus = (MAX_MULTIPLIER - 1) * (weight / (weight + 5));
  return 1 + bonus;
}

type FrecencyState = {
  entries: FrecencyMap;
  /** Records a run of palette item `id` — call once, from the single place an item actually fires. */
  bump: (id: string) => void;
};

export const useFrecencyStore = create<FrecencyState>()(
  persist(
    (set, get) => ({
      entries: {},
      bump: (id) => set({ entries: bumpFrecency(get().entries, id) }),
    }),
    { name: 'midnite-studio:palette-frecency' },
  ),
);
