import type { Dirent } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { execGit, mergedNames } from '@midnite/studio-git-engine';
import {
  SCAN_ITEMS_CAP,
  type DetectorInfo,
  type Ecosystem,
  type RepoDescriptor,
  type ScanCategory,
  type ScanItem,
  type ScanResult,
  type Worktree,
} from '@midnite/studio-shared';

import { confineTree, describeFsError } from '../fs-scope-write';
import { defaultLogger, type Logger } from '../log';
import { listRepos, worktreesFor } from '../repo-registry';
import {
  DEFAULT_DETECTORS,
  matchesFileSuffix,
  matchesPathSuffix,
  STALE_WORKTREE_DETECTOR,
  type ArtifactDetector,
} from './detectors';

/**
 * Smart Scan + Storage's own walker (Phase 59 Theme C, widened by Phase 72
 * Themes A-C) — every registered repo/worktree plus one optional
 * user-chosen extra root, never an unscoped disk crawl. Sizing is a plain JS
 * `readdir`+`lstat` walk, not `du`: nothing in this repo shells `du`, and a
 * walk is cancellable via `AbortSignal`, reports real progress, and cannot be
 * defeated by a path with a newline in it.
 */

/** No pathological tree can walk past this many directory levels. */
export const MAX_WALK_DEPTH = 12;
/**
 * No pathological tree can walk past this many entries — `node_modules`
 * included. Raised from 200k (Decision 6) as a consequence of the per-root
 * budget (Phase 72 Theme E) giving more roots a fair share of it.
 *
 * Measured, not asserted: a throwaway readdir-driven walk (this file's own
 * `walk`/`dirBytes` shape — no `lstat` per directory, symlinks skipped, no
 * descent past a matched detector) over this repo's own `node_modules` plus
 * a second worktree's copy — 123,649 real directory entries — on an
 * M-series MacBook Pro took 18.6s, ~6,600 entries/second. At that rate the
 * full 500,000-entry budget is a worst case of roughly 75 seconds, not "a
 * second or two" — but that worst case is the SUM across every registered
 * repo/worktree combined, cancellable, and shown behind a progress ring; it
 * is not the number this phase actually needs to bound. `MAX_ENTRIES_PER_ROOT`
 * below is: at this same measured rate, no single root can cost the scan
 * more than ~7.5 seconds, which is the fairness property Decision 6 exists
 * to deliver. Lower this constant if a future measurement on real hardware
 * disagrees.
 */
export const MAX_WALK_ENTRIES = 500_000;
/**
 * No single repo/worktree root can consume more than this share of the
 * global budget above (Phase 72 Theme E, Decision 6). Before this existed, a
 * pathological repo early in `collectRoots()`'s order could consume the
 * entire budget and every later repo would silently report zero — this makes
 * that failure *partial and visible* (`truncatedRoots`) rather than *total
 * and silent*. Lives on `WalkState` (`perRootLimit`), not read directly here,
 * because `cleanItems`'s own `dirBytes(confined, newWalkState(), …)` call
 * sizes a single already-confirmed item and must never be capped by it —
 * `newWalkState()`'s `Infinity` default is what keeps that call byte-for-byte
 * unaffected (Decision 11).
 */
export const MAX_ENTRIES_PER_ROOT = 50_000;
/** How often `onProgress` fires — every N entries walked, not on a timer. */
const PROGRESS_EVERY_ENTRIES = 50;

/**
 * Returns the whole detector, not just a category — `walk` needs `id`,
 * `ecosystem`, `reclaim`, `label` and `producer` to build the `ScanItem` and
 * the `detectors` map, and a second lookup by category would be ambiguous
 * the moment two detectors share one. `classify` returns the **first**
 * matching detector in `detectors` order (Theme A item 6's ordering
 * invariant, asserted in `detectors.test.ts`).
 *
 * `siblingNames` is a pure argument the caller builds once per directory
 * from the parent's own `readdir` (free — no extra syscall); the only
 * impurity is the `childAny` arm's own `readdir`, confined to candidates
 * whose name already matched (Decision 2).
 */
export async function classify(
  path: string,
  siblingNames: ReadonlySet<string>,
  detectors: readonly ArtifactDetector[] = DEFAULT_DETECTORS,
  log: Logger = defaultLogger,
): Promise<ArtifactDetector | null> {
  for (const detector of detectors) {
    const matches = detector.match.some((suffix) => matchesPathSuffix(path, suffix));
    if (!matches) continue;

    switch (detector.evidence.kind) {
      case 'none':
        return detector;
      case 'siblingAny':
        if (detector.evidence.names.some((name) => siblingNames.has(name))) return detector;
        break;
      case 'siblingSuffix':
        if (matchesFileSuffix(siblingNames, detector.evidence.suffixes)) return detector;
        break;
      case 'childAny': {
        // Evidence, not traversal: does not touch `state.entriesWalked`, and
        // a candidate the user cannot read fails closed (no match) rather
        // than failing the scan.
        const childNames = await readDirSafe(path, log);
        const names = new Set(childNames.map((c) => c.name));
        if (detector.evidence.names.some((name) => names.has(name))) return detector;
        break;
      }
    }
  }
  return null;
}

/**
 * Exported for Phase 73's `system-cache-service.ts` (and, later, Phase 74's
 * Trash walk — both need the identical symlink-skip/abort/budget machinery
 * this walker already gets right, and a second copy is exactly where those
 * would drift). Four `export` keywords, no behaviour change, no signature
 * change, no budget change — Phase 73/74 only ever construct one through
 * `newWalkState()`, never a literal, so the two fields Theme E adds below
 * are invisible to them.
 */
export type WalkState = {
  items: ScanItem[];
  byCategory: Record<ScanCategory, number>;
  byEcosystem: Record<Ecosystem, number>;
  detectors: Record<string, DetectorInfo>;
  totalBytes: number;
  entriesWalked: number;
  itemsTruncated: boolean;
  /**
   * `entriesWalked`'s value at the moment the CURRENT root started —
   * `scanWorkspace` resets this once per root, immediately before that
   * root's own `walk`/`dirBytes` call. `budgetExhausted` subtracts this from
   * `entriesWalked` to get the current root's own share.
   */
  entriesAtRootStart: number;
  /**
   * The per-root cap in force for this walk. Defaults to `Infinity` here —
   * only `scanWorkspace` ever sets it to `MAX_ENTRIES_PER_ROOT` — so
   * `cleanItems`'s own `dirBytes(confined, newWalkState(), …)` delete-time
   * sizing call is never capped by it (Decision 11).
   */
  perRootLimit: number;
  /** Repo roots dropped for exceeding `perRootLimit`, filled by `scanWorkspace`. */
  truncatedRoots: string[];
};

/**
 * `true` once the walk has spent either its global budget or its current
 * root's own share of it. Replaces five separate `entriesWalked >=
 * MAX_WALK_ENTRIES` comparisons (Phase 72 Theme E, Decision 6) with one
 * check both bounds go through.
 */
function budgetExhausted(state: WalkState): boolean {
  return (
    state.entriesWalked >= MAX_WALK_ENTRIES ||
    state.entriesWalked - state.entriesAtRootStart >= state.perRootLimit
  );
}

export function newWalkState(): WalkState {
  return {
    items: [],
    byCategory: {
      dependencies: 0,
      buildOutput: 0,
      toolCache: 0,
      staleWorktree: 0,
      looseObjects: 0,
    },
    byEcosystem: {
      node: 0,
      multi: 0,
      rust: 0,
      cpp: 0,
      dotnet: 0,
      python: 0,
      java: 0,
      swift: 0,
      ruby: 0,
      go: 0,
      media: 0,
      git: 0,
    },
    detectors: {},
    totalBytes: 0,
    entriesWalked: 0,
    itemsTruncated: false,
    entriesAtRootStart: 0,
    // Infinite by default — load-bearing for `cleanItems`'s delete-time
    // sizing call (Decision 11). Only `scanWorkspace` sets the real cap.
    perRootLimit: Number.POSITIVE_INFINITY,
    truncatedRoots: [],
  };
}

function addItem(state: WalkState, item: ScanItem, info: DetectorInfo): void {
  state.byCategory[item.category] += item.bytes;
  state.byEcosystem[item.ecosystem] += item.bytes;
  state.totalBytes += item.bytes;
  state.detectors[item.detectorId] = info;
  if (state.items.length < SCAN_ITEMS_CAP) {
    state.items.push(item);
  } else {
    state.itemsTruncated = true;
  }
}

export async function readDirSafe(dir: string, log: Logger): Promise<Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    // Permission-denied (or any other unreadable) subtree: skip it and keep
    // walking rather than fail the whole Smart Scan over one root-owned
    // directory. Logged for diagnostics, not surfaced to the user directly.
    log(`[optimizer] scan: could not read "${dir}": ${describeFsError(error)}`);
    return [];
  }
}

/**
 * Total bytes under `root`, walked iteratively (no recursion, so a deep
 * `node_modules` cannot blow the call stack). Shares `state`'s entry budget
 * and abort signal with the outer walk: a matched directory that is itself
 * enormous still respects the same bounds.
 */
export async function dirBytes(
  root: string,
  state: WalkState,
  signal: AbortSignal,
  log: Logger,
): Promise<number> {
  let total = 0;
  const stack = [root];

  while (stack.length > 0) {
    if (signal.aborted || budgetExhausted(state)) break;
    const dir = stack.pop();
    if (dir === undefined) continue;

    const entries = await readDirSafe(dir, log);
    for (const entry of entries) {
      if (signal.aborted || budgetExhausted(state)) break;
      state.entriesWalked += 1;
      if (entry.isSymbolicLink()) continue; // never traversed or sized

      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile()) {
        try {
          total += (await lstat(full)).size;
        } catch {
          // Vanished between readdir and lstat — skip rather than fail the sizing pass.
        }
      }
    }
  }

  return total;
}

async function walk(
  dir: string,
  depth: number,
  repoId: string | null,
  state: WalkState,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
  log: Logger,
  detectors: readonly ArtifactDetector[],
): Promise<void> {
  if (signal.aborted || depth > MAX_WALK_DEPTH || budgetExhausted(state)) return;

  const entries = await readDirSafe(dir, log);
  // Built once per directory — even when no entry in it is a candidate —
  // rather than per-entry: a per-entry `Set` construction would turn an
  // O(n) walk into O(n²) on a wide `node_modules`.
  const siblingNames = new Set(entries.map((e) => e.name));

  for (const entry of entries) {
    if (signal.aborted || budgetExhausted(state)) return;
    state.entriesWalked += 1;
    if (state.entriesWalked % PROGRESS_EVERY_ENTRIES === 0) {
      onProgress(state.entriesWalked, MAX_WALK_ENTRIES);
    }

    if (entry.name === '.git') continue; // refused at any depth, above classify
    if (entry.isSymbolicLink()) continue; // never traversed

    const full = join(dir, entry.name);
    if (!entry.isDirectory()) continue;

    const detector = await classify(full, siblingNames, detectors, log);
    if (detector !== null) {
      // A directory matching a detector is SIZED and not descended into —
      // the walk's entry budget must not be spent on npm's own tree.
      const bytes = await dirBytes(full, state, signal, log);
      addItem(
        state,
        {
          path: full,
          bytes,
          category: detector.category,
          repoId,
          detectorId: detector.id,
          ecosystem: detector.ecosystem,
          reclaim: detector.reclaim,
        },
        { label: detector.label, producer: detector.producer },
      );
      continue;
    }

    await walk(full, depth + 1, repoId, state, signal, onProgress, log, detectors);
  }
}

/**
 * A worktree is a stale-worktree candidate when: its branch is not null (a
 * detached HEAD is never a candidate), it is not the main worktree, and that
 * branch is merged into the repository's default branch (`headRef`). A repo
 * with no `headRef` (a brand-new repo with no commits) has no default branch
 * to merge against, so it contributes no candidates.
 */
export async function staleWorktreeCandidates(
  repo: RepoDescriptor,
  worktrees: readonly Worktree[],
): Promise<Set<string>> {
  const candidates = new Set<string>();
  if (!repo.headRef) return candidates;

  const mergedRes = await execGit(repo.path, [
    'for-each-ref',
    '--format=%(refname:short)',
    '--merged',
    repo.headRef,
    'refs/heads',
  ]);
  if (mergedRes.exitCode !== 0) return candidates;

  const merged = mergedNames(mergedRes.stdout);
  for (const worktree of worktrees) {
    if (worktree.isMain) continue;
    if (worktree.branch === null) continue;
    if (merged.has(worktree.branch)) candidates.add(worktree.path);
  }
  return candidates;
}

type ScanRootEntry = { path: string; repoId: string | null; stale: boolean };

async function collectRoots(extraRoot?: string): Promise<ScanRootEntry[]> {
  const repos = await listRepos();
  const roots: ScanRootEntry[] = [];

  for (const repo of repos) {
    const worktrees = await worktreesFor(repo.id);
    const stale = await staleWorktreeCandidates(repo, worktrees);
    for (const worktree of worktrees) {
      roots.push({ path: worktree.path, repoId: repo.id, stale: stale.has(worktree.path) });
    }
  }

  if (extraRoot) roots.push({ path: extraRoot, repoId: null, stale: false });
  return roots;
}

export type ScanWorkspaceOptions = {
  /** One user-chosen extra root per scan — never an unscoped crawl. */
  extraRoot?: string;
  signal: AbortSignal;
  /** A stream, not a return value — the Scan button's progress ring is driven by this. */
  onProgress: (done: number, total: number) => void;
  log?: Logger;
  /**
   * Injectable catalogue, exactly as `patterns` was — rejected alternative:
   * a module-level mutable "active detectors" would make a future concurrent
   * scan silently cross-contaminate. Defaults to the full catalogue.
   */
  detectors?: readonly ArtifactDetector[];
  /**
   * Ecosystems (Phase 72 Theme E) to skip. Filtered out of `DEFAULT_DETECTORS`
   * once, before the root loop — filtering after the walk would spend the
   * entry budget finding things the user asked not to see. An explicit
   * `opts.detectors` (the test seam) wins over this: a fixture that injects
   * both is not a puzzle, `opts.detectors` is simply what runs.
   */
  disabledEcosystems?: readonly Ecosystem[];
  /**
   * Test-only override of `MAX_ENTRIES_PER_ROOT` — lets
   * `scan-service.test.ts` exercise the per-root budget over a handful of
   * real directory entries instead of materialising 50,000 of them.
   */
  perRootLimit?: number;
};

export async function scanWorkspace(opts: ScanWorkspaceOptions): Promise<ScanResult> {
  const log = opts.log ?? defaultLogger;
  const detectors =
    opts.detectors ??
    DEFAULT_DETECTORS.filter((d) => !(opts.disabledEcosystems ?? []).includes(d.ecosystem));
  const roots = await collectRoots(opts.extraRoot);
  const state = newWalkState();
  // The one place the real per-root cap is ever set — `newWalkState()`'s
  // `Infinity` default is what keeps `cleanItems`'s own delete-time sizing
  // call unaffected by it (Decision 11).
  state.perRootLimit = opts.perRootLimit ?? MAX_ENTRIES_PER_ROOT;

  for (const root of roots) {
    if (opts.signal.aborted) break;
    // Reset the per-root baseline BEFORE the exhaustion check below, so that
    // check only ever reflects the GLOBAL bound here — the previous root's
    // own share is already spent and must not carry over and wrongly stop
    // every subsequent root.
    state.entriesAtRootStart = state.entriesWalked;
    if (budgetExhausted(state)) break;

    if (root.stale) {
      // The whole worktree is the candidate — sized as one item rather than
      // also walked for node_modules/dist inside it, which would double-count
      // bytes reclaimable by the one delete that already covers them.
      const bytes = await dirBytes(root.path, state, opts.signal, log);
      addItem(
        state,
        {
          path: root.path,
          bytes,
          category: STALE_WORKTREE_DETECTOR.category,
          repoId: root.repoId,
          detectorId: STALE_WORKTREE_DETECTOR.id,
          ecosystem: STALE_WORKTREE_DETECTOR.ecosystem,
          reclaim: STALE_WORKTREE_DETECTOR.reclaim,
        },
        { label: STALE_WORKTREE_DETECTOR.label, producer: STALE_WORKTREE_DETECTOR.producer },
      );
    } else {
      await walk(root.path, 0, root.repoId, state, opts.signal, opts.onProgress, log, detectors);
    }

    // Truncated if THIS root's own share of the budget is what stopped it —
    // pushed once per root, never duplicated. An abort mid-root does NOT
    // push: the scan was cancelled, not cut short, and labelling it that way
    // would be a lie.
    if (!opts.signal.aborted && state.entriesWalked - state.entriesAtRootStart >= state.perRootLimit) {
      state.truncatedRoots.push(root.path);
    }

    opts.onProgress(state.entriesWalked, MAX_WALK_ENTRIES);
  }

  /*
   * `looseObjects` is deliberately never populated. Decision 11 reads the
   * git-gc figure through git-engine's existing `parseCountObjects`/`readHealth`
   * read-only, but that function returns loose-object COUNT plus a COMBINED
   * (packed + loose) byte figure — never the loose-only byte size a category
   * total needs — and the guardrail is "git-engine gains nothing," so no new
   * export was added to get one. The category stays in the wire contract for
   * a later phase that does add it; this scan reports zero for it rather than
   * a wrong number.
   */

  return {
    totalBytes: state.totalBytes,
    byCategory: state.byCategory,
    byEcosystem: state.byEcosystem,
    detectors: state.detectors,
    items: state.items,
    truncated:
      state.itemsTruncated ||
      state.entriesWalked >= MAX_WALK_ENTRIES ||
      state.truncatedRoots.length > 0,
    truncatedRoots: state.truncatedRoots,
  };
}

export type CleanOutcome = {
  freedBytes: number;
  skipped: { path: string; reason: string }[];
};

/**
 * Re-validates each path against the CURRENT filesystem state before it is
 * trashed — a `ScanResult` is computed, rendered and confirmed, and minutes
 * may pass in between. A path that no longer exists, is now a symlink, or no
 * longer resolves under any of `knownRoots` is skipped and reported rather
 * than thrown.
 *
 * `freedBytes` is measured fresh here (a directory's current size via the
 * same `dirBytes` walk, or a plain `lstat` for a file) rather than trusted
 * from the renderer's earlier scan — the two can disagree by however much
 * changed in the interval this re-validation exists to cover, and this is the
 * one figure that is actually true at delete time.
 *
 * `trash` is injected so this stays testable under bare vitest
 * (`scan-service.test.ts` passes a fake); the real caller supplies Electron's
 * `shell.trashItem`, never a bare recursive `fs.rm`.
 */
export async function cleanItems(
  paths: readonly string[],
  roots: readonly string[],
  trash: (path: string) => Promise<void>,
): Promise<CleanOutcome> {
  let freedBytes = 0;
  const skipped: { path: string; reason: string }[] = [];

  for (const path of paths) {
    let stat;
    try {
      stat = await lstat(path);
    } catch {
      skipped.push({ path, reason: 'no longer exists' });
      continue;
    }
    if (stat.isSymbolicLink()) {
      skipped.push({ path, reason: 'is now a symlink' });
      continue;
    }

    let confined: string | null = null;
    for (const root of roots) {
      confined = await confineTree(root, path);
      if (confined !== null) break;
    }
    if (confined === null) {
      skipped.push({ path, reason: 'no longer resolves under a known root' });
      continue;
    }

    const abort = new AbortController();
    const bytes = stat.isDirectory()
      ? await dirBytes(confined, newWalkState(), abort.signal, defaultLogger)
      : stat.size;

    try {
      await trash(confined);
      freedBytes += bytes;
    } catch (error) {
      skipped.push({ path, reason: describeFsError(error) });
    }
  }

  return { freedBytes, skipped };
}

/** Every path `cleanItems` may confine against, for the caller to assemble. */
export async function knownRoots(): Promise<string[]> {
  const roots: string[] = [];
  for (const repo of await listRepos()) {
    for (const worktree of await worktreesFor(repo.id)) roots.push(worktree.path);
  }
  return roots;
}
