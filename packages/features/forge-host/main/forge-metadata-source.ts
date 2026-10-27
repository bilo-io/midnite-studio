import type {
  Forge,
  ForgeComment,
  ForgeIssue,
  ForgeIssueCommentsResult,
  ForgeIssuesResult,
  ForgePull,
  ForgePullCommentsResult,
  ForgePullsResult,
  ForgePullThreadsResult,
} from '@midnite/studio-shared';

import { RateLimitError, type MetadataRecord, type MetadataSource, type NdjsonKind, type SnapshotKind } from './mirror-metadata';

/**
 * The read half of the forge feature's `ForgeAdapter` that the export needs. Declared structurally
 * because a feature never imports another: the real adapter (`forge/main/adapter.ts`) satisfies it
 * as is, so the app that composes both hands `forge-host` an adapter and nothing here names `forge`.
 */
export type ForgeReadAdapter = {
  readonly kind: string;
  listIssues(forge: Forge, options: { limit: number; state: 'open' | 'closed' | 'all' }): Promise<ForgeIssuesResult>;
  listPulls(forge: Forge, options: { limit: number; state: 'open' | 'closed' | 'merged' | 'all' }): Promise<ForgePullsResult>;
  issueComments(forge: Forge, number: number): Promise<ForgeIssueCommentsResult>;
  pullComments(forge: Forge, number: number): Promise<ForgePullCommentsResult>;
  pullThreads(forge: Forge, number: number): Promise<ForgePullThreadsResult>;
};

export type ForgeMetadataSourceOptions = {
  adapter: ForgeReadAdapter;
  forge: Forge;
  /** The account the adapter authenticates as, recorded in the manifest. */
  account: string;
  /** Per-listing cap; the adapter pages internally up to it. */
  limit?: number;
  /** The provider's default branch tip, when the caller knows it (`ReachableRepo.defaultBranch` plus `git ls-remote`). */
  defaultBranch?: () => Promise<{ ref: string; sha: string } | null>;
};

const RATE_LIMIT = /rate.?limit|abuse|secondary|\b(403|429)\b|too many requests/i;

/** An adapter reports failure in `error`, never by throwing; turn it back into what the export understands. */
function unwrap<T extends { error: string | null; cli?: { reason: string; hint?: string } }>(result: T, what: string): T {
  if (result.cli && result.cli.reason !== 'ready') {
    throw new Error(`${what}: forge CLI ${result.cli.reason}${result.cli.hint ? ` (${result.cli.hint})` : ''}`);
  }
  if (result.error) {
    if (RATE_LIMIT.test(result.error)) throw new RateLimitError(`${what}: ${result.error}`);
    throw new Error(`${what}: ${result.error}`);
  }
  return result;
}

const isAfter = (iso: string | null | undefined, since: string | null): boolean =>
  since === null || (iso != null && Date.parse(iso) >= Date.parse(since));

/**
 * Wrap a `ForgeAdapter` into the `MetadataSource` port (Phase 119 Theme A). Create one per refresh:
 * the issue and pull listings are fetched once and shared by every kind that needs them.
 *
 * What it can and cannot carry is the adapter's, stated rather than hidden:
 * - issues and pulls are keyed by their number; a pull has no `updatedAt`, so an incremental run
 *   re-lists every pull (cheap) and re-reads the conversation only of pulls still open or closed
 *   since the last run;
 * - `reviews` holds review verdicts and inline threads; `comments` holds the discussion on both;
 * - labels and milestones are what issues carry (the adapter has no listing of either);
 * - releases are empty for now (GitHub releases need `gh-cli.ts`, tracked in the phase doc).
 */
export function createForgeMetadataSource(options: ForgeMetadataSourceOptions): MetadataSource {
  const { adapter, forge, account } = options;
  const limit = options.limit ?? 1000;
  let issues: Promise<ForgeIssue[]> | null = null;
  let pulls: Promise<ForgePull[]> | null = null;
  const listIssues = () =>
    (issues ??= adapter.listIssues(forge, { limit, state: 'all' }).then((r) => (r.disabled ? [] : unwrap(r, 'issues').issues)));
  const listPulls = () => (pulls ??= adapter.listPulls(forge, { limit, state: 'all' }).then((r) => unwrap(r, 'pulls').pulls));
  // A rejected listing must not be memoised, or a backoff retry would re-throw the same error forever.
  const forget = <T>(p: Promise<T>, reset: () => void): Promise<T> => p.catch((e) => { reset(); throw e; });

  const conversation = (c: ForgeComment, scope: 'issue' | 'pull', number: number): MetadataRecord => ({ ...c, id: `${scope}${number}:${c.id}`, scope, number });

  async function pullsToRead(since: string | null): Promise<ForgePull[]> {
    const all = await forget(listPulls(), () => (pulls = null));
    return all.filter((p) => p.state === 'open' || isAfter(p.closedAt ?? p.mergedAt, since));
  }

  return {
    adapter: adapter.kind,
    account,
    defaultBranch: options.defaultBranch ?? (async () => null),
    async records(kind: NdjsonKind, since: string | null): Promise<MetadataRecord[]> {
      if (kind === 'issues') {
        const all = await forget(listIssues(), () => (issues = null));
        return all.filter((i) => isAfter(i.updatedAt, since)).map((i) => ({ ...i, id: i.number }));
      }
      if (kind === 'pulls') {
        const all = await forget(listPulls(), () => (pulls = null));
        return all.map((p) => ({ ...p, id: p.number }));
      }
      if (kind === 'comments') {
        const out: MetadataRecord[] = [];
        for (const issue of (await forget(listIssues(), () => (issues = null))).filter((i) => isAfter(i.updatedAt, since))) {
          const r = unwrap(await adapter.issueComments(forge, issue.number), `issue #${issue.number} comments`);
          out.push(...r.comments.map((c) => conversation(c, 'issue', issue.number)));
        }
        for (const pull of await pullsToRead(since)) {
          const r = unwrap(await adapter.pullComments(forge, pull.number), `pull #${pull.number} comments`);
          out.push(...r.comments.filter((c) => c.kind === 'comment').map((c) => conversation(c, 'pull', pull.number)));
        }
        return out;
      }
      // reviews: verdicts from the conversation, plus inline threads
      const out: MetadataRecord[] = [];
      for (const pull of await pullsToRead(since)) {
        const r = unwrap(await adapter.pullComments(forge, pull.number), `pull #${pull.number} reviews`);
        out.push(...r.comments.filter((c) => c.kind === 'review').map((c) => conversation(c, 'pull', pull.number)));
        const t = unwrap(await adapter.pullThreads(forge, pull.number), `pull #${pull.number} threads`);
        out.push(...t.threads.map((thread) => ({ ...thread, id: `pull${pull.number}:thread:${thread.id}`, scope: 'thread', number: pull.number })));
      }
      return out;
    },
    async snapshot(kind: SnapshotKind): Promise<unknown> {
      if (kind === 'releases') return [];
      const all = await forget(listIssues(), () => (issues = null));
      if (kind === 'labels') {
        const byName = new Map<string, { name: string; color: string }>();
        for (const label of all.flatMap((i) => i.labels)) byName.set(label.name, label);
        return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
      }
      return [...new Set(all.flatMap((i) => (i.milestone ? [i.milestone.title] : [])))].sort().map((title) => ({ title }));
    },
  };
}
