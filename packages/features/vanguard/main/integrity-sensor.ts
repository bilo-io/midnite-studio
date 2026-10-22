import { watch as nodeWatch } from 'node:fs';
import { stat } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';

import {
  integrityEntriesFor,
  integritySeverity,
  matchIntegrityEntry,
  type EvidenceItem,
  type IntegrityBaseline,
  type IntegrityClass,
  type NewSecurityFinding,
  type RemediationAction,
} from '@midnite/studio-shared';

import { attributeChange, type IntegrityLiveSession } from './integrity/attribution';
import { loadBaseline, saveBaseline } from './integrity/baseline-store';
import {
  bundleFindings,
  checkBundleIntegrity,
  RELEASES_ARE_NOTARISED,
} from './integrity/bundle-check';
import { diffIntegrity, integrityCandidates, type IntegrityChange } from './integrity/diff';
import { baseDir, enumerateWatched, hashWatched, type IntegrityRoots, type WatchedFile } from './integrity/enumerate';
import { resolveGitCommonDir, uncommittedPaths } from './integrity/git';
import type { SensorContext, SensorDefinition } from './sensor-host';

export { attributeChange, type IntegrityAttribution, type IntegrityLiveSession } from './integrity/attribution';
export {
  bundleFindings,
  bundlePathFor,
  checkBundleIntegrity,
  classifySignature,
  RELEASES_ARE_NOTARISED,
  type BundleCheckResult,
} from './integrity/bundle-check';
export { diffIntegrity, integrityCandidates, integrityFingerprint, type IntegrityChange } from './integrity/diff';

/**
 * The integrity sensor (Phase 120 Theme C): a SHA-256 baseline over the files that decide what runs —
 * the watched set in `shared/src/vanguard-integrity.ts` — per open repo and for the user's home, with a
 * change made outside a git commit reported as an `integrity` finding.
 *
 * Two triggers feed one scan per scope: `fs.watch` on the watched directories, debounced so an editor's
 * write-rename-chmod burst is one scan; and a slow full re-hash on an interval, which catches what a
 * watcher misses (a dropped FSEvent, a change while the app was closed). Scans of one scope never
 * overlap. No `electron` here: the composer injects the repos, the live sessions, `runProcess` and the
 * ledger's writer, and every one has a fake in the tests.
 */

/** What the sensor host hands a sensor. */
export type IntegritySensorContext = SensorContext;

export interface IntegrityRepo {
  repoId: string;
  /** The working tree root. */
  path: string;
}

export interface FsWatcherLike {
  close(): void;
}

/** `fs.watch`'s shape, injectable so the tests drive events by hand. */
export type IntegrityWatchFn = (
  path: string,
  options: { recursive: boolean },
  listener: (filename: string | null) => void,
) => FsWatcherLike;

export interface IntegritySensorDeps {
  /** The repos open now. Read on every full scan, so opening or closing a repo is picked up. */
  repos(): readonly IntegrityRepo[] | Promise<readonly IntegrityRepo[]>;
  /** The pty sessions live now (agent ones carry `agentId`). */
  liveSessions(): readonly IntegrityLiveSession[] | Promise<readonly IntegrityLiveSession[]>;
  /** Resolve the open finding with this fingerprint — the change behind it was committed or reverted. */
  resolve?(fingerprint: string): Promise<void>;
  /**
   * Phase 121 G's agent audit trail, once it exists: the tool call that touched `path` in the window, as
   * one line. Absent until then; the finding says attribution is by time alone.
   */
  toolCallFor?(query: { path: string; sessionIds: string[]; from: number; to: number }): Promise<string | undefined>;
  watch?: IntegrityWatchFn;
  /** Quiet period after the last watcher event before the scope is scanned. */
  debounceMs?: number;
  /** The slow full re-hash. */
  rehashIntervalMs?: number;
}

export const INTEGRITY_SENSOR_ID = 'integrity';
export const BUNDLE_SENSOR_ID = 'bundle-integrity';
export const INTEGRITY_DEBOUNCE_MS = 750;
export const INTEGRITY_REHASH_MS = 5 * 60_000;

const CLASS_LABEL: Record<IntegrityClass, string> = {
  hooks: 'Git hook',
  mcp: 'MCP config',
  'agent-config': 'Agent config',
  scripts: 'package.json scripts',
  lockfile: 'Lockfile',
  env: 'Environment file',
  registry: 'Registry config',
  editor: 'Editor workspace config',
  'git-config': 'Global git config',
};

/** The home-dir scope's id: not a plain token, so it can never collide with a repo id's baseline file. */
export const USER_SCOPE_ID = '~user';

const QUARANTINABLE: ReadonlySet<IntegrityClass> = new Set(['hooks', 'mcp', 'agent-config']);
const MAX_PAUSE_ACTIONS = 3;

interface Scope {
  id: string;
  kind: 'repo' | 'user';
  repoId?: string;
  roots: IntegrityRoots;
  /** The directory paths reported to the user (`~/…` or the repo-relative path). */
  root: string;
  baseline: IntegrityBaseline | null | undefined;
  watchers: Map<string, FsWatcherLike>;
  timer: ReturnType<typeof setTimeout> | null;
  /** Agent sessions seen live since the last scan, sampled on each watcher event. */
  sessionsSeen: Map<string, IntegrityLiveSession>;
  windowStart: number | null;
  queue: Promise<unknown>;
}

const defaultWatch: IntegrityWatchFn = (path, options, listener) =>
  nodeWatch(path, { recursive: options.recursive, persistent: false }, (_event, filename) =>
    listener(typeof filename === 'string' ? filename : null),
  );

async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The directories to watch for a scope: each base non-recursively (a top-level watched file, or a watched
 * directory being created), and each existing watched directory recursively.
 */
async function watchTargets(roots: IntegrityRoots): Promise<Array<{ path: string; recursive: boolean }>> {
  const targets = new Map<string, boolean>();
  const add = (path: string, recursive: boolean): void => {
    targets.set(path, (targets.get(path) ?? false) || recursive);
  };
  for (const entry of integrityEntriesFor(roots.scope)) {
    const root = baseDir(roots, entry.base);
    if (root === undefined) continue;
    if (entry.match === 'dir') {
      const dir = join(root, entry.path);
      if (await isDir(dir)) add(dir, true);
      else if (await isDir(root)) add(root, false);
    } else {
      const parent = entry.path.includes('/') ? join(root, entry.path.slice(0, entry.path.lastIndexOf('/'))) : root;
      if (await isDir(parent)) add(parent, false);
      else if (await isDir(root)) add(root, false);
    }
  }
  return [...targets].map(([path, recursive]) => ({ path, recursive }));
}

/**
 * Whether a path a watcher reported could change the scope's watched set: a watched file itself, or a
 * directory on the way to one (`.vscode` being created, `.claude` being renamed into place). A base
 * watched non-recursively — the repo root, the home dir — reports every sibling too, and those are noise.
 */
export function relevantPath(roots: IntegrityRoots, absPath: string): boolean {
  for (const base of ['worktree', 'git-dir', 'home'] as const) {
    const root = baseDir(roots, base);
    if (root === undefined) continue;
    const rel = relative(root, absPath).split(sep).join('/');
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) continue;
    // Churn inside a nested checkout or an install under a watched directory never reaches the walk.
    const parts = rel.split('/');
    if (parts.some((part, i) => part === 'node_modules' || (part === '.git' && i > 0) || (part === 'worktrees' && parts[0] === '.claude'))) {
      continue;
    }
    if (matchIntegrityEntry(roots.scope, base, rel) !== undefined) return true;
    for (const entry of integrityEntriesFor(roots.scope)) {
      if (entry.base === base && entry.match !== 'prefix' && (entry.path === rel || entry.path.startsWith(`${rel}/`))) return true;
    }
  }
  return false;
}

const display = (scope: Scope, file: WatchedFile): string =>
  scope.kind === 'user' ? `~/${file.relPath}` : file.base === 'git-dir' ? `.git/${file.relPath}` : file.relPath;

function findingFor(
  scope: Scope,
  change: IntegrityChange,
  attribution: ReturnType<typeof attributeChange>,
): Omit<NewSecurityFinding, 'source'> {
  const { file } = change;
  const shown = display(scope, file);
  const verb = change.kind === 'created' ? 'appeared' : change.kind === 'deleted' ? 'was deleted' : 'changed';
  const evidence: EvidenceItem[] = [
    { kind: 'path', path: file.absPath, ...(change.after !== null ? { hash: change.after } : {}) },
  ];
  if (change.before !== null) evidence.push({ kind: 'hash', algorithm: 'sha256', value: change.before, path: file.absPath });
  const remediation: RemediationAction[] = attribution.sessions
    .slice(0, MAX_PAUSE_ACTIONS)
    .map((s) => ({ id: 'pause-session' as const, sessionId: s.sessionId }));
  if (change.after !== null && QUARANTINABLE.has(file.entry.class)) {
    remediation.push({ id: 'quarantine-file', path: file.absPath });
  }
  remediation.push({ id: 'mute' });
  const outside = scope.kind === 'user' ? 'in your home directory' : 'outside a git commit';
  return {
    fingerprint: change.fingerprint,
    severity: integritySeverity(file.entry.class),
    category: 'integrity',
    title: `${CLASS_LABEL[file.entry.class]} ${verb} ${outside}: ${shown}`,
    detail: `${shown} ${verb}${scope.kind === 'repo' ? ' and the change is not in a commit (the file is dirty, untracked or outside version control)' : ''}. Why it is watched: ${file.entry.reason} ${attribution.summary}`,
    evidence,
    remediation,
    ...(attribution.sessions[0] ? { sessionId: attribution.sessions[0].sessionId } : {}),
    ...(scope.repoId !== undefined ? { repoId: scope.repoId } : {}),
  };
}

export function createIntegritySensor(deps: IntegritySensorDeps): SensorDefinition {
  const watchFn = deps.watch ?? defaultWatch;
  const debounceMs = deps.debounceMs ?? INTEGRITY_DEBOUNCE_MS;
  const scopes = new Map<string, Scope>();
  let ctx: IntegritySensorContext | null = null;
  let stopped = false;

  const sampleSessions = async (scope: Scope): Promise<void> => {
    try {
      for (const s of await deps.liveSessions()) if (s.agentId) scope.sessionsSeen.set(s.sessionId, s);
    } catch (error) {
      ctx?.log('warn', `live sessions unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  async function scan(scope: Scope, c: IntegritySensorContext): Promise<number> {
    if (c.signal.aborted) return 0;
    if (scope.baseline === undefined) scope.baseline = await loadBaseline(c.userData, scope.id);
    const files = await enumerateWatched(scope.roots);
    const observed = new Map<string, string | null>();
    for (const file of files) observed.set(file.key, await hashWatched(file));
    if (c.signal.aborted) return 0;

    const candidates = integrityCandidates(scope.baseline, observed);
    const committed = new Set<string>();
    if (scope.kind === 'repo' && scope.roots.worktree !== undefined && candidates.length > 0) {
      const worktreeKeys = candidates.filter((key) => key.startsWith('worktree:'));
      const rels = worktreeKeys.map((key) => key.slice('worktree:'.length));
      const dirty = await uncommittedPaths(c.runProcess, scope.roots.worktree, rels);
      if (dirty !== undefined) for (const key of worktreeKeys) if (!dirty.has(key.slice('worktree:'.length))) committed.add(key);
    }

    const result = diffIntegrity({
      scopeId: scope.id,
      root: scope.root,
      baseline: scope.baseline,
      files,
      observed,
      committed,
      fileFor: (key) => {
        const colon = key.indexOf(':');
        const base = key.slice(0, colon) as WatchedFile['base'];
        const relPath = key.slice(colon + 1);
        const entry = matchIntegrityEntry(scope.kind, base, relPath);
        const root = baseDir(scope.roots, base);
        return entry && root !== undefined ? { key, base, relPath, absPath: join(root, relPath), entry } : undefined;
      },
      now: c.now(),
    });

    if (result.changes.length > 0 || result.resolved.length > 0 || result.fresh) {
      scope.baseline = result.baseline;
      await saveBaseline(c.userData, result.baseline);
    } else {
      scope.baseline = result.baseline;
    }

    if (result.changes.length > 0) await sampleSessions(scope);
    const sessions = [...scope.sessionsSeen.values()];
    const windowStart = scope.windowStart ?? c.now();
    scope.sessionsSeen.clear();
    scope.windowStart = null;

    for (const change of result.changes) {
      const target = { scope: scope.kind, root: scope.roots.worktree ?? scope.roots.home ?? scope.root, ...(scope.repoId ? { repoId: scope.repoId } : {}) };
      const matched = attributeChange(sessions, target);
      const toolCall =
        deps.toolCallFor && matched.sessions.length > 0
          ? await deps
              .toolCallFor({ path: change.file.absPath, sessionIds: matched.sessions.map((s) => s.sessionId), from: windowStart, to: c.now() })
              .catch(() => undefined)
          : undefined;
      const attribution = toolCall ? attributeChange(sessions, target, toolCall) : matched;
      await c.record(findingFor(scope, change, attribution));
    }
    for (const fingerprint of result.resolved) await deps.resolve?.(fingerprint).catch(() => undefined);
    return result.changes.length;
  }

  /** Run `scan` behind any scan of this scope already in flight. */
  const enqueue = (scope: Scope, c: IntegritySensorContext): Promise<number> => {
    const next = scope.queue.then(() => scan(scope, c)).then(
      async (n) => {
        await armWatchers(scope, c);
        return n;
      },
      (error: unknown) => {
        c.log('warn', `scan of ${scope.root} failed: ${error instanceof Error ? error.message : String(error)}`);
        return 0;
      },
    );
    scope.queue = next;
    return next;
  };

  function onEvent(scope: Scope, dir: string, filename: string | null): void {
    if (stopped || ctx === null) return;
    const c = ctx;
    if (filename !== null && !relevantPath(scope.roots, join(dir, filename))) return;
    // Sample the live sessions once per burst (the first event), and again when the scan reports.
    if (scope.windowStart === null) {
      scope.windowStart = c.now();
      void sampleSessions(scope);
    }
    if (scope.timer !== null) clearTimeout(scope.timer);
    scope.timer = setTimeout(() => {
      scope.timer = null;
      if (!stopped) void enqueue(scope, c);
    }, debounceMs);
  }

  async function armWatchers(scope: Scope, c: IntegritySensorContext): Promise<void> {
    if (stopped) return;
    const wanted = await watchTargets(scope.roots);
    const keys = new Set(wanted.map((t) => `${t.recursive ? 'r' : 'f'}:${t.path}`));
    for (const [key, watcher] of scope.watchers) {
      if (!keys.has(key)) {
        watcher.close();
        scope.watchers.delete(key);
      }
    }
    for (const target of wanted) {
      const key = `${target.recursive ? 'r' : 'f'}:${target.path}`;
      if (scope.watchers.has(key)) continue;
      try {
        scope.watchers.set(key, watchFn(target.path, { recursive: target.recursive }, (f) => onEvent(scope, target.path, f)));
      } catch (error) {
        c.log('warn', `cannot watch ${target.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  function dropScope(scope: Scope): void {
    if (scope.timer !== null) clearTimeout(scope.timer);
    scope.timer = null;
    for (const watcher of scope.watchers.values()) watcher.close();
    scope.watchers.clear();
  }

  async function syncScopes(c: IntegritySensorContext): Promise<Scope[]> {
    const wanted = new Map<string, Omit<Scope, 'baseline' | 'watchers' | 'timer' | 'sessionsSeen' | 'windowStart' | 'queue'>>();
    if (c.homeDir !== undefined) {
      wanted.set(USER_SCOPE_ID, { id: USER_SCOPE_ID, kind: 'user', roots: { scope: 'user', home: c.homeDir }, root: '~' });
    }
    for (const repo of await deps.repos()) {
      const existing = scopes.get(repo.repoId);
      const gitDir =
        existing?.roots.worktree === repo.path ? existing.roots.gitDir : await resolveGitCommonDir(c.runProcess, repo.path);
      wanted.set(repo.repoId, {
        id: repo.repoId,
        kind: 'repo',
        repoId: repo.repoId,
        roots: { scope: 'repo', worktree: repo.path, ...(gitDir !== undefined ? { gitDir } : {}) },
        root: repo.path,
      });
    }
    for (const [id, scope] of scopes) {
      const want = wanted.get(id);
      if (want === undefined || want.root !== scope.root) {
        dropScope(scope);
        scopes.delete(id);
      }
    }
    for (const [id, want] of wanted) {
      if (!scopes.has(id)) {
        scopes.set(id, {
          ...want,
          baseline: undefined,
          watchers: new Map(),
          timer: null,
          sessionsSeen: new Map(),
          windowStart: null,
          queue: Promise.resolve(),
        });
      }
    }
    return [...scopes.values()];
  }

  async function scanAll(c: IntegritySensorContext): Promise<number> {
    let total = 0;
    for (const scope of await syncScopes(c)) {
      if (c.signal.aborted) break;
      await sampleSessions(scope);
      total += await enqueue(scope, c);
    }
    return total;
  }

  return {
    id: INTEGRITY_SENSOR_ID,
    label: 'Repo and config integrity',
    description:
      'Hashes the files that decide what runs (agent and MCP config, git hooks, package scripts, lockfiles, env and registry files) and reports a change made outside a git commit.',
    schedule: { kind: 'interval', ms: deps.rehashIntervalMs ?? INTEGRITY_REHASH_MS },
    async start(c) {
      stopped = false;
      ctx = c;
      await syncScopes(c);
      for (const scope of scopes.values()) await armWatchers(scope, c);
      return () => {
        stopped = true;
        ctx = null;
        for (const scope of scopes.values()) dropScope(scope);
        scopes.clear();
      };
    },
    async run(c) {
      ctx ??= c;
      return { findings: await scanAll(c) };
    },
  };
}

/** The bundle self-check as a sensor: one run at start (launch), and again on "Run now". */
export function createBundleIntegritySensor(deps: {
  execPath: string;
  /** An installed build (`app.isPackaged`). */
  packaged: boolean;
  /** Defaults to `packaged && RELEASES_ARE_NOTARISED`. */
  expectDeveloperId?: boolean;
  resolve?(fingerprint: string): Promise<void>;
  platform?: NodeJS.Platform;
}): SensorDefinition {
  return {
    id: BUNDLE_SENSOR_ID,
    label: 'App bundle signature',
    description: "Verifies the app's own code signature and Gatekeeper assessment at launch (codesign --verify --deep --strict, spctl --assess).",
    schedule: { kind: 'none' },
    async run(c) {
      const result = await checkBundleIntegrity({
        execPath: deps.execPath,
        runProcess: c.runProcess,
        ...(deps.platform ? { platform: deps.platform } : {}),
      });
      if (result === undefined) return { findings: 0 };
      const { findings, cleared } = bundleFindings(result, {
        packaged: deps.packaged,
        expectDeveloperId: deps.expectDeveloperId ?? (deps.packaged && RELEASES_ARE_NOTARISED),
      });
      for (const finding of findings) await c.record(finding);
      for (const fingerprint of cleared) await deps.resolve?.(fingerprint).catch(() => undefined);
      return { findings: findings.length };
    },
  };
}
