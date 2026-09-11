import { createHash } from 'node:crypto';

import { EVENT_CHANNELS, type Forge, type ForgeIssue, type ForgeProject, type ForgePull, type ForgeRun, type ForgeSubscriptionKind, type SyncStatusEvent } from '@midnite/studio-shared';

import type { Logger } from '../log';
import { broadcastToWindowsOnRepo } from '../window-manager';
import { githubForge } from '../ipc/forge-handlers';
import { listIssues, listPulls, listRuns } from './gh-cli';
import { listProjects } from './gh-project';

/**
 * Interest-based forge polling (Phase 84 Theme C).
 *
 * Every forge query in `queries.ts` sits on a 60-second `staleTime` with no
 * push and no poll behind it — freshness is whatever navigation happens to
 * trigger. This is the missing push: a window subscribes a `{repoId, kind}`
 * pair while a forge view (Actions, Reviews, Issues, Projects, the status-bar
 * chip) is mounted; the last unsubscribe — including an implicit one from the
 * window closing — stops the poll. Zero subscribers costs zero `gh` calls,
 * which is what keeps a repo nobody is looking at out of the idle-CPU budget
 * `idle-cpu.mjs` asserts against (Theme J.4).
 *
 * Structured exactly like `fetch-scheduler.ts`: every external effect is
 * injected (`ForgePollerDeps`), so `forge-poller.test.ts` can drive the
 * subscription lifecycle, the clock and the poll result deterministically.
 * `index.ts` builds the one real instance with {@link createForgePoller}.
 */

export const FORGE_POLL_MS = 60_000;
export const FORGE_POLL_BACKOFF_BASE_MS = 30_000;
export const FORGE_POLL_BACKOFF_MAX_MS = 10 * 60_000;

/** Doubles the previous backoff (or starts at the base), capped at the ceiling. */
export function nextForgePollBackoffMs(previousMs: number): number {
  if (previousMs <= 0) return FORGE_POLL_BACKOFF_BASE_MS;
  return Math.min(previousMs * 2, FORGE_POLL_BACKOFF_MAX_MS);
}

/** A poll result's `error` text naming a rate limit, the one signal `gh`'s wrapped commands expose. */
export function looksRateLimited(message: string): boolean {
  return /rate limit|403/i.test(message);
}

/**
 * A compact projection per kind — ids plus whatever field a status change
 * shows up in, never titles or bodies. Deterministic (stable field order) so
 * two polls of an unchanged listing hash identically.
 */
export function forgeProjection(kind: ForgeSubscriptionKind, payload: {
  runs?: readonly ForgeRun[];
  pulls?: readonly ForgePull[];
  issues?: readonly ForgeIssue[];
  projects?: readonly ForgeProject[];
}): unknown {
  switch (kind) {
    case 'runs':
      return (payload.runs ?? []).map((run) => ({
        id: run.id,
        status: run.status,
        conclusion: run.conclusion,
        updatedAt: run.updatedAt,
      }));
    case 'pulls':
      return (payload.pulls ?? []).map((pull) => ({
        number: pull.number,
        state: pull.state,
        isDraft: pull.isDraft,
        reviewDecision: pull.reviewDecision,
        checks: pull.checks,
        mergedAt: pull.mergedAt,
        closedAt: pull.closedAt,
      }));
    case 'issues':
      return (payload.issues ?? []).map((issue) => ({
        number: issue.number,
        state: issue.state,
        updatedAt: issue.updatedAt,
      }));
    case 'projects':
      return (payload.projects ?? []).map((project) => ({
        id: project.id,
        number: project.number,
        title: project.title,
        closed: project.closed,
      }));
  }
}

/** A stable hash of a projection — order-sensitive, which is fine: `gh` lists in one consistent order per query. */
export function hashProjection(projection: unknown): string {
  return createHash('sha1').update(JSON.stringify(projection)).digest('hex');
}

export type PollOutcome =
  | { ok: true; hash: string }
  | { ok: false; message: string; rateLimited: boolean };

export type ForgePollerDeps = {
  now: () => number;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
  /** Resolve a repo's GitHub remote, or `null` when it has none. */
  resolveForge: (repoId: string) => Promise<Forge | null>;
  /** Run the one `gh` listing this kind needs and hash a compact projection of it. */
  poll: (forge: Forge, kind: ForgeSubscriptionKind) => Promise<PollOutcome>;
  /** Ping every window subscribed to `{repoId, kind}` (narrowed further by repo via `broadcastToWindowsOnRepo`). */
  broadcastChanged: (repoId: string, kind: ForgeSubscriptionKind) => void;
  broadcastSyncStatus: (event: SyncStatusEvent) => void;
  log: Logger;
};

type KeyState = {
  repoId: string;
  kind: ForgeSubscriptionKind;
  subscribers: Set<number>;
  timer: unknown;
  lastHash: string | null;
  backoffMs: number;
  backoffUntil: number | null;
  lastError: string | null;
};

const keyOf = (repoId: string, kind: ForgeSubscriptionKind): string => `${repoId}::${kind}`;

/** Registered once, real at boot — see `index.ts`. Tests build their own. */
export class ForgePoller {
  private readonly keys = new Map<string, KeyState>();

  constructor(private readonly deps: ForgePollerDeps) {}

  /** A window subscribes interest in one `{repoId, kind}` pair. */
  subscribe(repoId: string, kind: ForgeSubscriptionKind, windowId: number): void {
    const key = keyOf(repoId, kind);
    let state = this.keys.get(key);
    if (!state) {
      state = {
        repoId,
        kind,
        subscribers: new Set(),
        timer: null,
        lastHash: null,
        backoffMs: 0,
        backoffUntil: null,
        lastError: null,
      };
      this.keys.set(key, state);
    }
    const wasEmpty = state.subscribers.size === 0;
    state.subscribers.add(windowId);
    if (wasEmpty) this.arm(key, state);
  }

  /** Drop one window's interest. The last one stops the poll entirely. */
  unsubscribe(repoId: string, kind: ForgeSubscriptionKind, windowId: number): void {
    this.dropOne(keyOf(repoId, kind), windowId);
  }

  /** A window closed — drop it from every key it ever subscribed to. */
  dropWindow(windowId: number): void {
    for (const key of [...this.keys.keys()]) this.dropOne(key, windowId);
  }

  private dropOne(key: string, windowId: number): void {
    const state = this.keys.get(key);
    if (!state) return;
    state.subscribers.delete(windowId);
    if (state.subscribers.size === 0) {
      if (state.timer !== null) this.deps.clearInterval(state.timer);
      this.keys.delete(key);
    }
  }

  private arm(key: string, state: KeyState): void {
    if (state.timer !== null) this.deps.clearInterval(state.timer);
    state.timer = this.deps.setInterval(() => void this.poll(key), FORGE_POLL_MS);
    // Poll immediately on the first subscriber rather than waiting a full
    // interval — a view that just mounted wants its first ping soon, not a
    // minute from now.
    void this.poll(key);
  }

  private async poll(key: string): Promise<void> {
    const state = this.keys.get(key);
    if (!state) return;
    if (state.backoffUntil !== null && this.deps.now() < state.backoffUntil) return;

    const forge = await this.deps.resolveForge(state.repoId);
    if (!forge) return; // No GitHub remote — nothing to poll, not a failure.

    const outcome = await this.deps.poll(forge, state.kind);

    if (!outcome.ok) {
      state.backoffMs = nextForgePollBackoffMs(state.backoffMs);
      state.backoffUntil = this.deps.now() + state.backoffMs;
      const firstFailure = state.lastError === null;
      state.lastError = outcome.message;
      if (firstFailure) {
        const reason = outcome.rateLimited ? 'rate-limited' : 'failed';
        this.deps.log.error(
          `[forge-poller] repo=${state.repoId} kind=${state.kind} ${reason}: ${outcome.message}`,
        );
      }
      this.deps.broadcastSyncStatus({
        repoId: state.repoId,
        source: 'forge',
        backoffUntil: state.backoffUntil,
        error: outcome.message,
      });
      return;
    }

    if (state.lastError !== null) {
      this.deps.log.info(`[forge-poller] repo=${state.repoId} kind=${state.kind} recovered`);
      this.deps.broadcastSyncStatus({ repoId: state.repoId, source: 'forge', backoffUntil: null, error: null });
    }
    state.backoffMs = 0;
    state.backoffUntil = null;
    state.lastError = null;

    if (state.lastHash !== null && state.lastHash !== outcome.hash) {
      this.deps.broadcastChanged(state.repoId, state.kind);
    }
    state.lastHash = outcome.hash;
  }

  /** Test/diagnostics only. */
  activeKeyCountForTests(): number {
    return this.keys.size;
  }
}

/** How many rows each listing asks for — enough to notice a change, not a full page render. */
const POLL_LIMIT = 50;

async function pollOnce(forge: Forge, kind: ForgeSubscriptionKind): Promise<PollOutcome> {
  switch (kind) {
    case 'runs': {
      const result = await listRuns(forge, { limit: POLL_LIMIT });
      if (result.error !== null) return { ok: false, message: result.error, rateLimited: looksRateLimited(result.error) };
      return { ok: true, hash: hashProjection(forgeProjection('runs', { runs: result.runs })) };
    }
    case 'pulls': {
      const result = await listPulls(forge, { limit: POLL_LIMIT, state: 'all' });
      if (result.error !== null) return { ok: false, message: result.error, rateLimited: looksRateLimited(result.error) };
      return { ok: true, hash: hashProjection(forgeProjection('pulls', { pulls: result.pulls })) };
    }
    case 'issues': {
      const result = await listIssues(forge, { limit: POLL_LIMIT, state: 'all' });
      if (result.error !== null) return { ok: false, message: result.error, rateLimited: looksRateLimited(result.error) };
      return { ok: true, hash: hashProjection(forgeProjection('issues', { issues: result.issues })) };
    }
    case 'projects': {
      const result = await listProjects(forge);
      if (result.error !== null) return { ok: false, message: result.error, rateLimited: looksRateLimited(result.error) };
      return { ok: true, hash: hashProjection(forgeProjection('projects', { projects: result.projects })) };
    }
  }
}

/**
 * The real wiring — `gh-cli.ts`/`gh-project.ts`'s listings (which already
 * cache and probe through `gh-shell.ts`) and `window-manager.ts`'s repo-scoped
 * broadcast. `index.ts` builds exactly one of these at boot.
 *
 * **Rate limits** (C.4): `gh run list`/`gh pr list`/`gh issue list`/`gh
 * project list` are wrapped CLI subcommands, not `gh api` — they do not
 * surface `x-ratelimit-remaining`/`reset` headers the way a raw `gh api` call
 * would. What they DO surface, in the CLI's own stderr, is the 403 body's
 * text once the limit is actually hit, which `looksRateLimited` matches; the
 * backoff below reacts to that the same way it reacts to any other repeated
 * failure. A numeric remaining/reset pair would need `gh api rate_limit`
 * polled alongside every listing — recorded in `outstanding.md` rather than
 * silently assumed away.
 */
export function createForgePoller(log: Logger): ForgePoller {
  return new ForgePoller({
    now: () => Date.now(),
    setInterval: (fn, ms) => {
      const timer = setInterval(fn, ms);
      (timer as { unref?: () => void }).unref?.();
      return timer;
    },
    clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
    resolveForge: (repoId) => githubForge(repoId),
    poll: (forge, kind) => pollOnce(forge, kind),
    broadcastChanged: (repoId, kind) => {
      broadcastToWindowsOnRepo(repoId, EVENT_CHANNELS.forgeChanged, { repoId, kind, at: Date.now() });
    },
    broadcastSyncStatus: (event) => {
      broadcastToWindowsOnRepo(event.repoId, EVENT_CHANNELS.syncStatus, event);
    },
    log,
  });
}
