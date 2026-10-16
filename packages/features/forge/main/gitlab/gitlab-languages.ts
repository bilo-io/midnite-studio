import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Forge, ForgeAccount, ReachableRepo } from '@midnite/studio-shared';

import { glGet } from './gitlab-client';

/**
 * Per-project language breakdowns for the GitLab rows of Settings ▸ Accounts
 * ▸ Reachable repositories. GitHub's listing carries languages inline; GitLab
 * has no such field on `GET /projects`, only `GET /projects/:id/languages`
 * (`{ "TypeScript": 66.7, … }`, percentages), one request per project. This
 * module is what keeps that affordable:
 *
 * - **Cache keyed by `${account.id}:${project.id}`**, storing the project's
 *   `last_activity_at` beside the languages. An unchanged timestamp reuses the
 *   entry with no request; a changed one refetches. Nothing else invalidates.
 * - **Only the first `limit` projects** (the listing is newest-activity first,
 *   so these are the rows on screen) and **at most `concurrency` in flight**.
 * - **A whole-step budget.** On expiry the caller gets whatever resolved; the
 *   stragglers keep running and land in the cache for the next open.
 * - **A per-project failure is an omission**, never an error — the row just
 *   draws no bar.
 *
 * Persisted to a small `gitlab-languages.json` in `userData` via the same
 * injected-directory pattern as `windows-store.ts`. Languages are public-ish
 * repo metadata, not a credential, so it deliberately stays out of
 * `secure-store.ts`.
 */

export type GitlabLanguages = NonNullable<ReachableRepo['languages']>;

type CacheEntry = { lastActivityAt: string; languages: GitlabLanguages };

export type GitlabLanguageProject = { id: number; lastActivityAt: string | undefined };

export type GitlabLanguageOptions = { limit?: number; concurrency?: number; budgetMs?: number };

export const GITLAB_LANGUAGE_LIMIT = 30;
export const GITLAB_LANGUAGE_CONCURRENCY = 4;
export const GITLAB_LANGUAGE_BUDGET_MS = 4_000;

/** Entries beyond this are dropped oldest-first on save — the file stays a few tens of KB. */
const MAX_PERSISTED_ENTRIES = 500;
const FILE_NAME = 'gitlab-languages.json';

export type GitlabLanguageCacheStore = {
  load: () => Promise<Record<string, CacheEntry>>;
  save: (entries: Record<string, CacheEntry>) => Promise<void>;
};

export function createGitlabLanguageCacheStore(directory: string): GitlabLanguageCacheStore {
  const file = join(directory, FILE_NAME);
  return {
    load: async () => {
      try {
        return parseStoredEntries(JSON.parse(await readFile(file, 'utf8')));
      } catch {
        return {}; // Missing or corrupt — a cold cache, not a failure.
      }
    },
    save: async (entries) => {
      try {
        await writeFile(file, `${JSON.stringify({ version: 1, entries })}\n`, 'utf8');
      } catch {
        // A read-only data dir just means languages refetch next launch.
      }
    },
  };
}

function parseStoredEntries(value: unknown): Record<string, CacheEntry> {
  if (typeof value !== 'object' || value === null) return {};
  const entries = (value as { entries?: unknown }).entries;
  if (typeof entries !== 'object' || entries === null) return {};
  const out: Record<string, CacheEntry> = {};
  for (const [key, raw] of Object.entries(entries as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const entry = raw as { lastActivityAt?: unknown; languages?: unknown };
    if (typeof entry.lastActivityAt !== 'string' || !Array.isArray(entry.languages)) continue;
    const languages = entry.languages.filter(
      (l): l is GitlabLanguages[number] =>
        typeof l === 'object' && l !== null && typeof l.name === 'string' && l.name.length > 0 && typeof l.size === 'number' && l.size >= 0,
    );
    out[key] = { lastActivityAt: entry.lastActivityAt, languages };
  }
  return out;
}

const cache = new Map<string, CacheEntry>();
let store: GitlabLanguageCacheStore | null = null;
let loaded: Promise<void> | null = null;

/** Wired once from `index.ts` with the `userData` store. Without it the cache is memory-only. */
export function configureGitlabLanguageCache(next: GitlabLanguageCacheStore | null): void {
  store = next;
  loaded = null;
}

/** Test-only reset — module-level state would otherwise leak between cases. */
export function __resetGitlabLanguageCacheForTests(): void {
  cache.clear();
  store = null;
  loaded = null;
}

function ensureLoaded(): Promise<void> {
  if (!store) return Promise.resolve();
  loaded ??= store.load().then((entries) => {
    // Anything fetched this session before the load finished is newer — keep it.
    for (const [key, entry] of Object.entries(entries)) if (!cache.has(key)) cache.set(key, entry);
  });
  return loaded;
}

function persist(): void {
  if (!store) return;
  const entries = [...cache.entries()].slice(-MAX_PERSISTED_ENTRIES);
  void store.save(Object.fromEntries(entries));
}

/** `{ "TypeScript": 66.7, … }` → `[{name, size}]`, largest first; malformed values are dropped. */
export function mapGitlabLanguages(raw: unknown): GitlabLanguages | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const out: GitlabLanguages = [];
  for (const [name, size] of Object.entries(raw as Record<string, unknown>)) {
    if (name.length === 0 || typeof size !== 'number' || !Number.isFinite(size) || size < 0) continue;
    out.push({ name, size });
  }
  return out.sort((a, b) => b.size - a.size);
}

/**
 * Languages for `projects` (in listing order), keyed by project id. A project
 * absent from the result simply has no bar — not fetched (past `limit`),
 * failed, timed out, or genuinely has no detected languages.
 */
export async function gitlabProjectLanguages(
  forge: Forge,
  account: ForgeAccount,
  projects: GitlabLanguageProject[],
  options: GitlabLanguageOptions = {},
): Promise<Map<number, GitlabLanguages>> {
  const limit = options.limit ?? GITLAB_LANGUAGE_LIMIT;
  const concurrency = Math.max(1, options.concurrency ?? GITLAB_LANGUAGE_CONCURRENCY);
  const budgetMs = options.budgetMs ?? GITLAB_LANGUAGE_BUDGET_MS;

  await ensureLoaded();

  const result = new Map<number, GitlabLanguages>();
  const pending: GitlabLanguageProject[] = [];
  for (const project of projects.slice(0, limit)) {
    const hit = cache.get(`${account.id}:${project.id}`);
    if (hit && project.lastActivityAt !== undefined && hit.lastActivityAt === project.lastActivityAt) {
      if (hit.languages.length > 0) result.set(project.id, hit.languages);
    } else {
      pending.push(project);
    }
  }
  if (pending.length === 0) return result;

  let changed = false;
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < pending.length) {
      const project = pending[next++]!;
      let response: Awaited<ReturnType<typeof glGet<unknown>>>;
      try {
        response = await glGet<unknown>(forge, account, `projects/${project.id}/languages`);
      } catch {
        continue; // Belt and braces — `glGet` returns failures, but one must never sink the listing.
      }
      if (!response.ok) continue;
      const languages = mapGitlabLanguages(response.data);
      if (languages === null) continue;
      if (languages.length > 0) result.set(project.id, languages);
      // Without a timestamp there is nothing to validate a cached entry against.
      if (project.lastActivityAt !== undefined) {
        const key = `${account.id}:${project.id}`;
        cache.delete(key); // re-insert so insertion order tracks recency for the persist cap
        cache.set(key, { lastActivityAt: project.lastActivityAt, languages });
        changed = true;
      }
    }
  };
  const pool = Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker)).then(() => {
    if (changed) persist();
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, budgetMs);
  });
  await Promise.race([pool, expired]);
  clearTimeout(timer);
  // A snapshot: stragglers that resolve after the budget fill the cache, not this answer.
  return new Map(result);
}
