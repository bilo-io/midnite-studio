import type { Commit, ForgeIssuesResult, ForgePullsResult, ForgeRunsResult } from '@midnite/studio-shared';

import { bridge } from '../../../../services/bridge';
import { keys } from '../../../../services/queries';
import type { ResourceCandidate, ResourceSource, SourceQuery } from '../resolve';
import { cached, isoMs } from './util';

/**
 * Git + forge sources. Commits come from `git log --grep` (the Search view's
 * own streaming channel, capped), refs and stashes from their list calls, and
 * PRs, issues and CI runs from what the forge pages already cached — a find
 * never shells out to `gh` for a list it already has.
 */

/** Commits asked for per find: enough to rank, never a history walk. */
const COMMIT_SEARCH_CAP = 50;
/** For "the latest commit" — newest first, so a handful is plenty. */
const COMMIT_RECENT_CAP = 10;
/** A PR list fetched only when nothing is cached — one page, every state. */
const PULLS_FALLBACK_LIMIT = 30;

/** Basic-regex metacharacters, escaped so "fix(auth)" is a literal. */
const escapeGrep = (term: string): string => term.replace(/[.*[\]^$\\]/g, '\\$&');

let searchSeq = 0;

/**
 * One-shot commit search over the streaming `search.*` channel: resolves with
 * every commit by `onDone`, or early with what has arrived when `signal`
 * aborts (and cancels that search in main, so a dropped find leaves no git
 * process behind).
 */
export function searchCommits(repoId: string, grep: readonly string[], cap: number, signal: AbortSignal): Promise<Commit[]> {
  const api = bridge();
  if (!api) return Promise.resolve([]);
  searchSeq += 1;
  const requestId = `resolve-${Date.now()}-${searchSeq}`;
  const commits: Commit[] = [];
  return new Promise<Commit[]>((resolve) => {
    const finish = (): void => {
      offBatch();
      offDone();
      signal.removeEventListener('abort', onAbort);
      resolve(commits);
    };
    const onAbort = (): void => {
      void api.search.cancel({ repoId, requestId });
      finish();
    };
    const offBatch = api.search.onBatch((event) => {
      if (event.requestId === requestId && event.mode === 'commits') commits.push(...(event.commits as Commit[]));
    });
    const offDone = api.search.onDone((event) => {
      if (event.requestId === requestId) finish();
    });
    signal.addEventListener('abort', onAbort);
    void api.search
      .start({
        repoId,
        mode: 'commits',
        requestId,
        cap,
        query: { ...(grep.length > 0 ? { grep: [...grep] } : {}), regexp: false, ignoreCase: true },
      })
      .then((started) => {
        if (!started.ok) finish();
      })
      .catch(finish);
  });
}

const commits: ResourceSource = {
  id: 'commits',
  kinds: ['commit'],
  load: async (q: SourceQuery) => {
    const api = bridge();
    const repoId = q.repoId;
    if (!api || repoId === null) return [];
    const out: ResourceCandidate[] = [];

    for (const id of q.exact) {
      if (id.type !== 'sha') continue;
      const { sha } = await api.repos.revParse({ repoId, rev: id.value });
      if (sha) out.push({ ref: { kind: 'commit', repoId, sha }, title: `commit ${sha.slice(0, 7)}`, exact: true });
    }
    if (q.exact.length > 0) return out;

    // Only words go to `--grep` (all must match, as `git log --all-match` reads them); a kind-only
    // or recency query lists the newest commits instead.
    const grep = q.terms.map(escapeGrep);
    if (grep.length === 0 && !q.kinds.includes('commit')) return out;
    const found = await searchCommits(repoId, grep, grep.length > 0 ? COMMIT_SEARCH_CAP : COMMIT_RECENT_CAP, q.signal);
    for (const commit of found) {
      out.push({
        ref: { kind: 'commit', repoId, sha: commit.sha },
        title: commit.subject,
        detail: `${commit.sha.slice(0, 7)} · ${commit.authorName}`,
        keywords: commit.refs.map((ref) => ref.replace(/^refs\/(heads|tags|remotes)\//, '')).join(' '),
        at: commit.committerDate * 1000,
        // `--grep` already matched the words somewhere in the message, body included.
        matched: grep.length > 0,
      });
    }
    return out;
  },
};

const refs: ResourceSource = {
  id: 'refs',
  kinds: ['ref'],
  load: async (q) => {
    const api = bridge();
    if (!api || q.repoId === null) return [];
    const repoId = q.repoId;
    const list = await api.repos.refs({ repoId });
    return list
      .filter((ref) => ref.kind !== 'head')
      .map((ref) => ({
        ref: { kind: 'ref' as const, repoId, fullName: ref.fullName },
        title: ref.name,
        detail: ref.kind === 'tag' ? 'tag' : ref.kind === 'remoteBranch' ? 'remote branch' : 'branch',
        ...(ref.isHead ? { keywords: 'current head checked out' } : {}),
      }));
  },
};

const stashes: ResourceSource = {
  id: 'stashes',
  kinds: ['stash'],
  load: async (q) => {
    const api = bridge();
    if (!api || q.repoId === null) return [];
    const repoId = q.repoId;
    const list = await api.stash.list({ repoId });
    return list.flatMap((entry) => {
      const index = Number(/\{(\d+)\}/.exec(entry.selector)?.[1]);
      if (!Number.isInteger(index)) return [];
      return [{ ref: { kind: 'stash' as const, repoId, index }, title: entry.message, detail: entry.selector, at: entry.authoredAt * 1000 }];
    });
  },
};

/** Exact when the query named this number as a PR (or bare `#n`). */
const numberNamed = (q: SourceQuery, kind: 'pull' | 'issue', value: number): boolean =>
  q.exact.some((id) => id.type === 'number' && id.value === value && id.kinds.includes(kind));

const pulls: ResourceSource = {
  id: 'pulls',
  kinds: ['pull'],
  load: async (q) => {
    if (q.repoId === null) return [];
    const repoId = q.repoId;
    let results = cached<ForgePullsResult>([...keys.forge(repoId), 'pulls']);
    if (results.length === 0) {
      const api = bridge();
      if (api) results = [await api.forge.pulls({ repoId, limit: PULLS_FALLBACK_LIMIT, state: 'all' })];
    }
    const seen = new Set<number>();
    return results
      .flatMap((result) => result.pulls)
      .filter((pull) => !seen.has(pull.number) && seen.add(pull.number))
      .map((pull) => ({
        ref: { kind: 'pull' as const, repoId, number: pull.number },
        title: pull.title,
        detail: `PR ${pull.number} · ${pull.isDraft ? 'draft' : pull.state}`,
        keywords: `${pull.headBranch} ${pull.author}`,
        // PR numbers only grow, so the newest PR has the highest one.
        at: pull.number,
        exact: numberNamed(q, 'pull', pull.number),
      }));
  },
};

const issues: ResourceSource = {
  id: 'issues',
  kinds: ['issue'],
  load: async (q) => {
    if (q.repoId === null) return [];
    const repoId = q.repoId;
    const seen = new Set<number>();
    return cached<ForgeIssuesResult>([...keys.forge(repoId), 'issues'])
      .flatMap((result) => result.issues)
      .filter((issue) => !seen.has(issue.number) && seen.add(issue.number))
      .map((issue) => {
        const at = isoMs(issue.updatedAt);
        return {
          ref: { kind: 'issue' as const, repoId, number: issue.number },
          title: issue.title,
          detail: `issue ${issue.number} · ${issue.state}`,
          keywords: `${issue.author} ${issue.labels.map((label) => label.name).join(' ')}`,
          ...(at === undefined ? {} : { at }),
          exact: numberNamed(q, 'issue', issue.number),
        };
      });
  },
};

const ciRuns: ResourceSource = {
  id: 'ci-runs',
  kinds: ['ciRun'],
  load: async (q) => {
    if (q.repoId === null) return [];
    const repoId = q.repoId;
    let results = cached<ForgeRunsResult>([...keys.forge(repoId), 'runs']);
    if (results.length === 0) {
      const api = bridge();
      if (api) results = [await api.forge.runs({ repoId })];
    }
    const seen = new Set<string>();
    return results
      .flatMap((result) => result.runs)
      .filter((run) => !seen.has(run.id) && seen.add(run.id))
      .map((run) => {
        const at = isoMs(run.createdAt);
        return {
          ref: { kind: 'ciRun' as const, repoId, runId: run.id },
          title: run.name,
          detail: [run.headBranch, run.conclusion ?? run.status].filter(Boolean).join(' · '),
          keywords: `${run.event ?? ''} ${run.headSha ?? ''}`,
          ...(at === undefined ? {} : { at }),
        };
      });
  },
};

export const GIT_SOURCES: readonly ResourceSource[] = [commits, refs, stashes, pulls, issues, ciRuns];
