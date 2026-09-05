/**
 * Lockstep version-bump planning, ported from `~/Dev/midnite`'s
 * `packages/shared/src/{version,release}.ts` (Phase 53 Theme B).
 *
 * Midnite Studio ships every `packages/*` package at one shared `MAJOR.MINOR`;
 * only `PATCH` advances independently per package. A package version is
 * therefore `‹global major›.‹global minor›.‹per-package patch›`. These helpers
 * are pure — no fs, no process, no `@midnite/*` import — so `scripts/version-check.mjs`
 * (which asserts the invariant in `moon ci`) and the two `/midnite-release-*`
 * skills (which plan a bump) agree on exactly one rule.
 *
 * The sibling app splits this across `version.ts` (bump math) and `release.ts`
 * (commit categorisation, tag planning). This repo's `release.ts` already ships
 * unrelated, unit-tested content (the public-repo URLs and
 * `extractChangelogSection`), so every helper the release skills name — bump
 * math *and* commit categorisation — is ported here instead, rather than
 * splitting a second file across the same seam for no local reason.
 */

/** The kind of bump a categorized change set implies. */
export type BumpLevel = 'major' | 'minor' | 'patch' | 'none';

/**
 * A categorized change set: the strongest bump level implied by the commits
 * since the last release, plus the packages whose files actually changed.
 *
 * `changedPackages` only matters for `patch` (it scopes the bump to the
 * affected packages). For `major`/`minor` the whole repo moves in lockstep, so
 * the list is ignored; for `none` nothing happens.
 */
export type ChangeSet = {
  level: BumpLevel;
  changedPackages: string[];
};

type SemVer = { major: number; minor: number; patch: number };

/** Parse `MAJOR.MINOR.PATCH` into numbers, throwing on a malformed version. */
function parseSemVer(version: string): SemVer {
  const parts = version.split('.');
  if (parts.length !== 3) {
    throw new Error(`invalid semver "${version}": expected MAJOR.MINOR.PATCH`);
  }
  const [major, minor, patch] = parts.map(Number) as [number, number, number];
  if (![major, minor, patch].every((n) => Number.isInteger(n) && n >= 0)) {
    throw new Error(`invalid semver "${version}": parts must be non-negative integers`);
  }
  return { major, minor, patch };
}

const formatSemVer = ({ major, minor, patch }: SemVer): string => `${major}.${minor}.${patch}`;

/**
 * Order two `MAJOR.MINOR.PATCH` versions: `-1` if `a < b`, `1` if `a > b`, `0` if
 * equal. Pure comparison (no pre-release/build metadata — this repo's versions
 * are plain triples). Throws on a malformed version, like the bump math below.
 */
export function compareSemVer(a: string, b: string): -1 | 0 | 1 {
  const va = parseSemVer(a);
  const vb = parseSemVer(b);
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (va[key] < vb[key]) return -1;
    if (va[key] > vb[key]) return 1;
  }
  return 0;
}

/**
 * True when every version shares one MAJOR.MINOR (patch may differ). The
 * lockstep invariant `version-check.mjs` asserts; an empty or single-version
 * list is trivially true. Throws on a malformed version so a bad edit surfaces
 * loudly.
 */
export function sharesLockstepMajorMinor(versions: string[]): boolean {
  const parsed = versions.map(parseSemVer);
  const [first, ...rest] = parsed;
  if (!first) return true; // empty list is trivially in lockstep
  return rest.every((v) => v.major === first.major && v.minor === first.minor);
}

/**
 * Compute the next version for every package under the lockstep rule.
 *
 * - `major`: every package → `(major+1).0.0`
 * - `minor`: every package → `major.(minor+1).0`
 * - `patch`: only `changedPackages` bump their own patch; the rest are unchanged
 * - `none`: identical to the input (idempotent)
 *
 * The shared MAJOR.MINOR is taken from the input versions (which must already be
 * in lockstep — guarded by `version-check.mjs`). Unknown package names in
 * `changedPackages` are ignored.
 */
export function planVersionBump(
  current: Record<string, string>,
  change: ChangeSet,
): Record<string, string> {
  const entries = Object.entries(current);
  const first = entries[0];
  if (!first || change.level === 'none') {
    return { ...current };
  }

  if (!sharesLockstepMajorMinor(entries.map(([, version]) => version))) {
    throw new Error('cannot plan a bump: current versions are not in lockstep MAJOR.MINOR');
  }

  if (change.level === 'major' || change.level === 'minor') {
    const { major, minor } = parseSemVer(first[1]);
    const next =
      change.level === 'major'
        ? { major: major + 1, minor: 0, patch: 0 }
        : { major, minor: minor + 1, patch: 0 };
    const target = formatSemVer(next);
    return Object.fromEntries(entries.map(([name]) => [name, target]));
  }

  // patch: bump only the changed packages, leave the rest untouched.
  const changed = new Set(change.changedPackages);
  return Object.fromEntries(
    entries.map(([name, version]) => {
      if (!changed.has(name)) return [name, version];
      const v = parseSemVer(version);
      return [name, formatSemVer({ ...v, patch: v.patch + 1 })];
    }),
  );
}

// --- Commit categorisation (feeds planVersionBump's ChangeSet) ---------------

/** A single conventional commit, parsed from its message. */
export type ConventionalCommit = {
  /** Lower-cased type token, e.g. `feat`, `fix`. May be an unrecognised word. */
  type: string;
  /** Lower-cased scope inside `type(scope):`, or `null` when absent. */
  scope: string | null;
  /** True for a `type!:` marker or a `BREAKING CHANGE` footer. */
  breaking: boolean;
  /** Subject text after the `:`. */
  description: string;
  /** Whether `type` is one of the recognised conventional-commit types. */
  known: boolean;
};

/** The conventional-commit types this repo's CLAUDE.md house style uses, plus the usual extras. */
export const KNOWN_COMMIT_TYPES = [
  'feat',
  'fix',
  'docs',
  'chore',
  'refactor',
  'test',
  'perf',
  'build',
  'ci',
  'style',
  'revert',
] as const;

export type KnownCommitType = (typeof KNOWN_COMMIT_TYPES)[number];

// `type(scope)!: description` — the conventional-commit subject grammar.
const SUBJECT_RE = /^([a-z]+)(?:\(([^)]+)\))?(!)?:[ \t]*(.*)$/i;
// A `BREAKING CHANGE:` / `BREAKING-CHANGE:` footer anywhere in the body.
const BREAKING_FOOTER_RE = /(^|\n)[ \t]*BREAKING[ -]CHANGE[ \t]*:/i;

/**
 * Parse a commit message into a {@link ConventionalCommit}, or `null` when the
 * subject doesn't fit the `type: subject` / `type(scope): subject` shape. The
 * first non-empty line is the subject; an unrecognised `type` parses but is
 * flagged `known: false` (the release-prep skill surfaces those for the human).
 * `breaking` is set by a `!` marker on the subject or a `BREAKING CHANGE`
 * footer in the body.
 */
export function parseConventionalCommit(message: string): ConventionalCommit | null {
  const subject = message.split('\n').find((line) => line.trim().length > 0)?.trim();
  if (!subject) return null;

  const match = SUBJECT_RE.exec(subject);
  if (!match) return null;

  const [, rawType = '', rawScope, bang, description = ''] = match;
  const type = rawType.toLowerCase();
  return {
    type,
    scope: rawScope ? rawScope.toLowerCase() : null,
    breaking: Boolean(bang) || BREAKING_FOOTER_RE.test(message),
    description: description.trim(),
    known: (KNOWN_COMMIT_TYPES as readonly string[]).includes(type),
  };
}

/**
 * The strongest bump level implied by a set of commits: any `BREAKING CHANGE`
 * → `major`; else any `feat` → `minor`; else any `fix` → `patch`; else `none`
 * (docs/chore/refactor/test/etc. don't trigger a release).
 */
export function bumpLevelFromCommits(commits: ConventionalCommit[]): BumpLevel {
  if (commits.some((c) => c.breaking)) return 'major';
  if (commits.some((c) => c.type === 'feat')) return 'minor';
  if (commits.some((c) => c.type === 'fix')) return 'patch';
  return 'none';
}

// --- Tag planning (the /midnite-release-complete half) ----------------------

/**
 * The git tags a release cuts here, in this repo, per the scheme:
 *
 * - **lockstep minor/major** — the shared MAJOR.MINOR advanced and every
 *   package moved to the new `X.Y.0` → a single repo tag `vX.Y.Z`.
 * - **independent patch** — MAJOR.MINOR unchanged, only some packages' patches
 *   bumped → a scoped tag `‹pkg›@X.Y.Z` per bumped package.
 *
 * These are the SOURCE tags in this (private) repo — never the namespaced
 * `midnite-studio/vX.Y.Z` tag `/midnite-release-complete` also cuts in the
 * public `bilo-io/midnite-apps` repo, which is a different, receiving-repo
 * concern this function has no opinion on.
 *
 * Returns `[]` when nothing changed. `previous`/`next` are the version maps
 * either side of {@link planVersionBump}; with no prior release (`previous`
 * empty) a release where every package lands on one version is the lockstep
 * baseline → a single `vX.Y.Z`. Throws if `previous` isn't itself in lockstep
 * (a broken prior release) rather than silently cutting a wrong tag.
 */
export function planReleaseTags(
  previous: Record<string, string>,
  next: Record<string, string>,
): string[] {
  const changed = Object.keys(next).filter((name) => next[name] !== previous[name]);
  if (changed.length === 0) return [];

  const prevVersions = Object.values(previous);
  if (!sharesLockstepMajorMinor(prevVersions)) {
    throw new Error('cannot plan release tags: previous versions are not in lockstep MAJOR.MINOR');
  }

  const majorMinor = (version: string): string => version.split('.').slice(0, 2).join('.');
  const changedNext = changed.map((name) => ({ name, version: next[name] ?? '' }));
  const target = changedNext[0]?.version ?? '';
  const prevFirst = prevVersions[0];

  // Lockstep minor/major → a single repo tag. Detected by the shared MAJOR.MINOR
  // advancing; with no prior release, by every package landing on one version.
  const lockstepBump =
    prevFirst === undefined
      ? Object.values(next).every((version) => version === target)
      : changedNext.every((entry) => majorMinor(entry.version) !== majorMinor(prevFirst));

  if (lockstepBump) return [`v${target}`];
  // Independent patch → a scoped tag per bumped package.
  return changedNext.map((entry) => `${entry.name}@${entry.version}`);
}

/** Extract `X.Y.Z` from a `release/vX.Y.Z` branch name, or `null` if it isn't one. */
export function versionFromReleaseBranch(branch: string): string | null {
  const match = /^release\/v(\d+\.\d+\.\d+)$/.exec(branch);
  return match ? (match[1] ?? null) : null;
}
