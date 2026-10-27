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

const RATE_LIMIT = /rate.?limit|too many requests|\b(?:http|status)\s*(?:403|429)\b/i;

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

/** Clock skew and a change landing between listing and stamping `fetchedAt` must not drop an update. */
const SKEW_MS = 5 * 60_000;
const isAfter = (iso: string | null | undefined, since: string | null): boolean => {
  if (since === null) return true;
  const at = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(at) || at >= Date.parse(since) - SKEW_MS; // an unreadable date counts as changed
};

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
  const pullConvo = new Map<number, Promise<ForgePullCommentsResult>>();
  // Memoised per refresh; a rejection clears only its own entry, so a backoff retry re-fetches.
  const memo = <T>(slot: () => Promise<T> | null, set: (p: Promise<T> | null) => void, load: () => Promise<T>): Promise<T> => {
    const existing = slot();
    if (existing) return existing;
    const created: Promise<T> = load().catch((error) => {
      if (slot() === created) set(null);
      throw error;
    });
    set(created);
    return created;
  };
  const truncated = (what: string): Error => new Error(`${what}: listing hit the ${limit} cap, the export would be incomplete`);
  const listIssues = () =>
    memo(() => issues, (p) => (issues = p), async () => {
      const r = await adapter.listIssues(forge, { limit, state: 'all' });
      if (r.disabled) return [];
      const found = unwrap(r, 'issues').issues;
      if (found.length >= limit) throw truncated('issues');
      return found;
    });
  const listPulls = () =>
    memo(() => pulls, (p) => (pulls = p), async () => {
      const found = unwrap(await adapter.listPulls(forge, { limit, state: 'all' }), 'pulls').pulls;
      if (found.length >= limit) throw truncated('pulls');
      return found;
    });
  /** `comments` and `reviews` both read one pull's conversation: fetch it once. */
  const pullConversation = async (number: number): Promise<ForgePullCommentsResult> => {
    let call = pullConvo.get(number);
    if (!call) {
      call = adapter.pullComments(forge, number).then((r) => unwrap(r, `pull #${number} comments`));
      pullConvo.set(number, call);
      call.catch(() => pullConvo.delete(number));
    }
    return call;
  };

  const conversation = (c: ForgeComment, scope: 'issue' | 'pull', number: number): MetadataRecord => ({ ...c, id: `${scope}${number}:${c.id}`, scope, number });

  async function pullsToRead(since: string | null): Promise<ForgePull[]> {
    const all = await listPulls();
    return all.filter((p) => p.state === 'open' || isAfter(p.closedAt ?? p.mergedAt, since));
  }

  return {
    adapter: adapter.kind,
    account,
    defaultBranch: options.defaultBranch ?? (async () => null),
    async records(kind: NdjsonKind, since: string | null): Promise<MetadataRecord[]> {
      if (kind === 'issues') {
        const all = await listIssues();
        return all.filter((i) => isAfter(i.updatedAt, since)).map((i) => ({ ...i, id: i.number }));
      }
      if (kind === 'pulls') {
        const all = await listPulls();
        return all.map((p) => ({ ...p, id: p.number }));
      }
      if (kind === 'comments') {
        const out: MetadataRecord[] = [];
        for (const issue of (await listIssues()).filter((i) => isAfter(i.updatedAt, since))) {
          const r = unwrap(await adapter.issueComments(forge, issue.number), `issue #${issue.number} comments`);
          out.push(...r.comments.map((c) => conversation(c, 'issue', issue.number)));
        }
        for (const pull of await pullsToRead(since)) {
          const r = await pullConversation(pull.number);
          out.push(...r.comments.filter((c) => c.kind === 'comment').map((c) => conversation(c, 'pull', pull.number)));
        }
        return out;
      }
      // reviews: verdicts from the conversation, plus inline threads
      const out: MetadataRecord[] = [];
      for (const pull of await pullsToRead(since)) {
        const r = await pullConversation(pull.number);
        out.push(...r.comments.filter((c) => c.kind === 'review').map((c) => conversation(c, 'pull', pull.number)));
        const t = unwrap(await adapter.pullThreads(forge, pull.number), `pull #${pull.number} threads`);
        out.push(...t.threads.map((thread) => ({ ...thread, id: `pull${pull.number}:thread:${thread.id}`, scope: 'thread', number: pull.number })));
      }
      return out;
    },
    async snapshot(kind: SnapshotKind): Promise<unknown> {
      if (kind === 'releases') return [];
      const all = await listIssues();
      if (kind === 'labels') {
        const byName = new Map<string, { name: string; color: string }>();
        for (const label of all.flatMap((i) => i.labels)) byName.set(label.name, label);
        return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
      }
      return [...new Set(all.flatMap((i) => (i.milestone ? [i.milestone.title] : [])))].sort().map((title) => ({ title }));
    },
  };
}
