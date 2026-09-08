import { readFile } from 'node:fs/promises';

import {
  COMPANION_DEFAULT_DIGEST_WINDOW_MS,
  parseDoneEntries,
  parseIndexWipRows,
  resolveDefaultBranch,
  type CompanionDigest,
  type CompanionDigestItem,
  type ForgePullsResult,
  type GraphRow,
  type Ref,
  type RepoDescriptor,
} from '@midnite/studio-shared';

import { confineToRoot } from '../fs-scope';
import { dispatchMcpCall, type McpDispatchResult } from '../mcp/dispatch';
import { nullCompanionStore, type CompanionStore } from './companion-store';

/**
 * What landed since the companion last greeted this repo, and what is still in
 * flight — Phase 79 Theme B.
 *
 * Composed out of the Phase 57 MCP tools plus two tracker files, for the same
 * reason `snapshot.ts` is: the companion has no business owning a second git
 * parser. What it *does* own is the window, which is the per-repo "last
 * greeted" mark in `companion.json` (Decision 11) with a seven-day fallback
 * for a repo this profile has never greeted.
 *
 * The two tracker files are read through the fs jail (`fs-scope.ts`) rather
 * than by joining strings: they sit *inside* the repository, so their path is
 * attacker-shaped in exactly the way `confineToRoot` exists for — a
 * `.midnite` that is a symlink out of the checkout resolves to `null` and the
 * digest simply has no tracker items, which is also what a repo without a
 * tracker gets.
 */

/** The tracker files, relative to the repository root. Repo-relative on purpose — `confineToRoot` refuses an absolute path. */
export const DONE_LOG_PATH = '.midnite/tasks/done.md';
export const INDEX_PATH = '.midnite/tasks/_INDEX.md';

/**
 * How many commits the landed half looks back through.
 *
 * `graph.log` clamps its own `limit` at 200 server-side, so this is the
 * ceiling rather than a choice: a window wider than 200 commits of history is
 * reported from the 200 most recent, which for a spoken two-sentence summary
 * is indistinguishable from complete.
 */
export const DIGEST_LOG_LIMIT = 200;

export type CompanionDigestDeps = {
  dispatch: (tool: string, input: unknown) => Promise<McpDispatchResult>;
  store: CompanionStore;
  /** Injected so a fixture repo's tracker files can be read without a jail lookup. */
  readTracker?: (repoRoot: string, relPath: string) => Promise<string | null>;
  now?: () => number;
};

/** The production reader: the fs jail, with "not there" and "not allowed" earning the same answer. */
export async function readTrackerFile(repoRoot: string, relPath: string): Promise<string | null> {
  const confined = await confineToRoot(repoRoot, relPath);
  if (confined === null) return null;
  try {
    return await readFile(confined, 'utf8');
  } catch {
    return null;
  }
}

export const defaultDigestDeps: CompanionDigestDeps = {
  dispatch: dispatchMcpCall,
  store: nullCompanionStore,
  readTracker: readTrackerFile,
};

let configured: CompanionDigestDeps = defaultDigestDeps;

/** Injected at boot with a store rooted at `app.getPath('userData')`. */
export function configureCompanion(store: CompanionStore): void {
  configured = { ...defaultDigestDeps, store };
}

export function companionDeps(): CompanionDigestDeps {
  return configured;
}

/** Reset module state. Tests only. */
export function resetCompanionDepsForTest(): void {
  configured = defaultDigestDeps;
}

function valueOf(result: McpDispatchResult): unknown {
  return result.ok ? result.value : null;
}

export async function buildCompanionDigest(
  req: { repoPath: string; since?: number | undefined; mark?: boolean | undefined },
  deps: CompanionDigestDeps = companionDeps(),
): Promise<CompanionDigest> {
  const now = (deps.now ?? Date.now)();
  const readTracker = deps.readTracker ?? readTrackerFile;

  const resolved = valueOf(await deps.dispatch('repo.resolve', { repoPath: req.repoPath })) as {
    repo: RepoDescriptor;
    branch: string | null;
  } | null;
  // Nothing registered at that path — an empty digest, not an error. The
  // script's "nothing to report" branch already exists for a quiet week.
  if (resolved === null) return { landed: [], inProgress: [], since: now };

  /*
    Window resolution, in order: an explicit `since` from the caller, then the
    persisted mark, then seven days. The explicit form exists so a script can
    re-ask for the same window it just narrated without the mark having moved
    under it.
  */
  const mark = req.since ?? (await deps.store.lastGreeted(resolved.repo.id));
  const since = mark ?? now - COMPANION_DEFAULT_DIGEST_WINDOW_MS;

  const [rows, refs, openPulls, mergedPulls, doneLog, indexFile] = await Promise.all([
    deps
      .dispatch('graph.log', { repoPath: req.repoPath, limit: DIGEST_LOG_LIMIT })
      .then((result) => (valueOf(result) as GraphRow[] | null) ?? []),
    deps
      .dispatch('branch.list', { repoPath: req.repoPath })
      .then((result) => (valueOf(result) as Ref[] | null) ?? []),
    deps
      .dispatch('forge.pulls', { repoPath: req.repoPath, state: 'open' })
      .then((result) => valueOf(result) as ForgePullsResult | null),
    deps
      .dispatch('forge.pulls', { repoPath: req.repoPath, state: 'merged' })
      .then((result) => valueOf(result) as ForgePullsResult | null),
    readTracker(resolved.repo.path, DONE_LOG_PATH),
    readTracker(resolved.repo.path, INDEX_PATH),
  ]);

  const defaultBranch = resolveDefaultBranch(refs);

  const landed: CompanionDigestItem[] = [
    ...landedCommits(rows, defaultBranch, since),
    ...mergedPullItems(mergedPulls, since),
    ...doneLogItems(doneLog, since),
  ].sort((a, b) => b.at - a.at);

  const inProgress: CompanionDigestItem[] = [
    ...openPullItems(openPulls),
    ...branchesAhead(refs, defaultBranch, now),
    ...indexWipItems(indexFile, now),
  ];

  /*
    Moving the mark is opt-in, and the default is NOT to move it. A digest is
    read by more than the greeting — the panel re-renders it, Theme D's script
    re-reads it after a switch offer — and a read that narrowed its own window
    would make the second look at one greeting's digest come back empty.
  */
  if (req.mark === true) await deps.store.markGreeted(resolved.repo.id, now);

  return { landed, inProgress, since };
}

/**
 * Commits on the default branch, newer than the mark.
 *
 * `graph.log` hands back laid-out rows for the whole graph, so "on the default
 * branch" is decided from each commit's own `refs` decorations plus first-parent
 * reachability from the branch tip — which is as far as a *composed* answer
 * can go without `rev-list`, and is right for the shape this repo actually
 * has: squash-merges onto `main`, so every landed commit *is* a first-parent
 * step from the tip.
 *
 * With no default branch resolvable (a fresh repo, an unconventional layout)
 * nothing is claimed rather than the whole log being reported as "landed".
 */
function landedCommits(
  rows: readonly GraphRow[],
  defaultBranch: string | null,
  since: number,
): CompanionDigestItem[] {
  if (defaultBranch === null) return [];

  const bySha = new Map(rows.map((row) => [row.commit.sha, row.commit]));
  const tip = rows.find((row) =>
    row.commit.refs.some(
      (ref) =>
        ref === `refs/heads/${defaultBranch}` ||
        ref.endsWith(`refs/remotes/origin/${defaultBranch}`),
    ),
  );
  if (!tip) return [];

  const items: CompanionDigestItem[] = [];
  let cursor = tip.commit;
  // Bounded by the row count: a cycle is impossible in a commit graph, but a
  // malformed fixture should not be able to spin here.
  for (let step = 0; step < rows.length; step += 1) {
    const at = cursor.committerDate * 1000;
    if (at < since) break;
    items.push({ kind: 'commit', title: cursor.subject, ref: cursor.sha.slice(0, 8), at });
    const parent = cursor.parents[0];
    if (parent === undefined) break;
    const next = bySha.get(parent);
    if (next === undefined) break;
    cursor = next;
  }
  return items;
}

function mergedPullItems(result: ForgePullsResult | null, since: number): CompanionDigestItem[] {
  if (result === null || result.cli.reason !== 'ready' || result.error !== null) return [];
  return result.pulls
    .filter((pull) => pull.mergedAt !== null)
    .map((pull) => ({
      kind: 'pr' as const,
      title: pull.title,
      ref: `#${pull.number}`,
      at: Date.parse(pull.mergedAt as string),
    }))
    .filter((item) => Number.isFinite(item.at) && item.at >= since);
}

function openPullItems(result: ForgePullsResult | null): CompanionDigestItem[] {
  if (result === null || result.cli.reason !== 'ready' || result.error !== null) return [];
  return result.pulls
    .filter((pull) => pull.state === 'open')
    .map((pull) => ({
      kind: 'pr' as const,
      title: pull.title,
      ref: `#${pull.number}`,
      /*
        An open PR has no merge date and this schema carries no `createdAt`, so
        `at` is the moment the digest was taken. That is honest for a field
        whose only consumer is `summariseDigest`'s ordering — an open PR is
        "now" by definition — and it is why `inProgress` is not re-sorted by
        `at` the way `landed` is.
      */
      at: Date.now(),
    }));
}

function doneLogItems(markdown: string | null, since: number): CompanionDigestItem[] {
  if (markdown === null) return [];
  return parseDoneEntries(markdown)
    .filter((entry) => entry.at >= since)
    .map((entry) => ({
      kind: 'phase' as const,
      title: entry.title,
      ref: entry.date,
      at: entry.at,
    }));
}

/**
 * Local branches that are not the default one and have unpushed work.
 *
 * **A documented approximation.** The phase doc asks for "non-default branches
 * ahead of the default branch"; that is `rev-list --count <default>..<branch>`
 * per branch, which is N subprocesses and no MCP tool — outside this theme's
 * "compose, do not parse" guardrail. What `branch.list` *does* return is
 * ahead-of-*upstream*, and for the workflow this app is built around (a
 * feature branch pushed to its own remote, merged by PR) the two agree: a
 * branch with unpushed commits is work in flight. A branch fully pushed and
 * still unmerged shows up as its open PR instead, which is the other half of
 * `inProgress`.
 */
function branchesAhead(
  refs: readonly Ref[],
  defaultBranch: string | null,
  now: number,
): CompanionDigestItem[] {
  return refs
    .filter((ref) => ref.kind === 'localBranch')
    .filter((ref) => ref.name !== defaultBranch)
    .filter((ref) => (ref.upstream?.ahead ?? 0) > 0)
    .map((ref) => ({
      kind: 'commit' as const,
      title: `${ref.name} (${ref.upstream?.ahead ?? 0} unpushed)`,
      ref: ref.name,
      at: now,
    }));
}

function indexWipItems(markdown: string | null, now: number): CompanionDigestItem[] {
  if (markdown === null) return [];
  return parseIndexWipRows(markdown).map((row) => ({
    kind: 'phase' as const,
    title:
      row.themes.length > 0
        ? `Phase ${row.phase} ${row.themes.join(', ')} — ${row.title}`
        : `Phase ${row.phase} — ${row.title}`,
    ref: row.phase,
    at: now,
  }));
}
