import type { ReachableRepo } from '@midnite/studio-shared';

import type { MirrorConfig, MirrorConfigRepo } from './mirror-config';
import { isSafeRemoteUrl, isSafeSegment, mirrorKey } from './mirror-layout';

/**
 * The repo picker's model (Phase 119 Theme A): what is on offer, what is chosen, and the edits to
 * `mirrors.json`'s `repos`. Headless on purpose: the view lands with Theme C's app, and the forge
 * feature that enumerates reachable repos is not importable from here, so candidates arrive as data.
 */
export type PickerSource = 'open' | 'reachable' | 'added';

export type PickerRow = MirrorConfigRepo & { key: string; source: PickerSource; selected: boolean; private: boolean };

/** One account's `listReachableRepos` result, tagged with the host it was listed from. */
export type ReachableGroup = { host: string; repos: readonly ReachableRepo[] };

export type PickerInput = {
  config: MirrorConfig;
  /** Repos Studio has open (host/owner/repo/url from their remotes): offered, and the default selection. */
  open?: readonly MirrorConfigRepo[];
  reachable?: readonly ReachableGroup[];
};

const SOURCE_RANK: Record<PickerSource, number> = { open: 0, added: 1, reachable: 2 };

/**
 * Every candidate once, by key. A repo already in the config is `selected`; an `open` repo is
 * `selected` too while nothing has ever been configured ("default: every repo Studio has open").
 * Sorted: open first, then added, then the rest, alphabetically within each.
 */
export function buildPickerRows({ config, open = [], reachable = [] }: PickerInput): PickerRow[] {
  const rows = new Map<string, PickerRow>();
  const chosen = new Set(config.repos.map(mirrorKey));
  const untouched = config.repos.length === 0 && Object.keys(config.state).length === 0;
  const add = (repo: MirrorConfigRepo, source: PickerSource, isPrivate = false): void => {
    const key = mirrorKey(repo);
    if (rows.has(key)) return;
    rows.set(key, { host: repo.host, owner: repo.owner, repo: repo.repo, url: repo.url, key, source, private: isPrivate, selected: chosen.has(key) || (untouched && source === 'open') });
  };
  for (const repo of open) if (isPickable(repo)) add(repo, 'open');
  for (const repo of config.repos) add(repo, 'added');
  for (const group of reachable) {
    for (const r of group.repos) {
      const candidate = { host: group.host, owner: r.owner, repo: r.name, url: r.url };
      if (isPickable(candidate)) add(candidate, 'reachable', r.private);
    }
  }
  return [...rows.values()].sort((a, b) => SOURCE_RANK[a.source] - SOURCE_RANK[b.source] || a.key.localeCompare(b.key));
}

function isPickable(repo: MirrorConfigRepo): boolean {
  return isSafeSegment(repo.owner) && isSafeSegment(repo.repo) && isSafeRemoteUrl(repo.url) && repo.host.length > 0;
}

/** The config with `rows`' selected repos as its `repos`; interval, root and run state are untouched. */
export function applySelection(config: MirrorConfig, rows: readonly PickerRow[]): MirrorConfig {
  const repos = rows.filter((r) => r.selected).map(({ host, owner, repo, url }) => ({ host, owner, repo, url }));
  return { ...config, repos };
}

export function toggleRow(rows: readonly PickerRow[], key: string): PickerRow[] {
  return rows.map((r) => (r.key === key ? { ...r, selected: !r.selected } : r));
}

export type ParsedRepoUrl = { ok: true; repo: MirrorConfigRepo } | { ok: false; reason: string };

/** "Add a repo" by URL: https `host/owner/repo[.git]` or scp-like `git@host:owner/repo[.git]`. Nested owners (GitLab groups) are not offered. */
export function parseRepoUrl(input: string): ParsedRepoUrl {
  const url = input.trim();
  if (!isSafeRemoteUrl(url)) return { ok: false, reason: 'not a safe remote URL' };
  const match = /^(?:https?|ssh|git):\/\/(?:[^/@]+@)?([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(url) ?? /^[A-Za-z0-9._-]+@([A-Za-z0-9.-]+):([^/:]+)\/([^/]+?)(?:\.git)?$/.exec(url);
  if (!match) return { ok: false, reason: 'expected host/owner/repo' };
  const [, host, owner, repo] = match as unknown as [string, string, string, string];
  if (!isSafeSegment(owner) || !isSafeSegment(repo)) return { ok: false, reason: 'owner or repo name is not allowed in a mirror path' };
  return { ok: true, repo: { host: host.toLowerCase(), owner, repo, url } };
}

/** Add a parsed repo to the config (selected), idempotently. */
export function addRepo(config: MirrorConfig, repo: MirrorConfigRepo): MirrorConfig {
  if (config.repos.some((r) => mirrorKey(r) === mirrorKey(repo))) return config;
  return { ...config, repos: [...config.repos, repo] };
}
