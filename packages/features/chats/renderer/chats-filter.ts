import { chatDateBucket, type ChatDateBucket, type ChatSummary } from '@midnite/studio-shared';

/**
 * Filtering and grouping for the Chats explorer — pure, so the rules are
 * testable without a DOM. The facets mirror the Sessions page's: a set per
 * facet (empty means "all"), a search box, and groups under sticky headers.
 */

/** The group key / filter value for a chat with no repository. */
export const NO_REPO = '__none__';
/** The group key of the pinned section. */
export const PINNED_GROUP = '__pinned__';

export type PinnedFacet = 'pinned' | 'unpinned';

export type ChatFilters = {
  engines: string[];
  repos: string[];
  dates: ChatDateBucket[];
  pinned: PinnedFacet[];
  query: string;
};

export const EMPTY_FILTERS: ChatFilters = { engines: [], repos: [], dates: [], pinned: [], query: '' };

export function hasActiveFilters(filters: ChatFilters): boolean {
  return (
    filters.engines.length > 0 ||
    filters.repos.length > 0 ||
    filters.dates.length > 0 ||
    filters.pinned.length > 0 ||
    filters.query.trim().length > 0
  );
}

/** Title, last message and repository name — what a row shows is what search finds. */
function searchable(chat: ChatSummary): string {
  return `${chat.title}\n${chat.preview}\n${chat.repoName ?? ''}`.toLowerCase();
}

export function filterChats(chats: readonly ChatSummary[], filters: ChatFilters, now: number): ChatSummary[] {
  const needle = filters.query.trim().toLowerCase();
  return chats.filter((chat) => {
    if (filters.engines.length > 0 && !filters.engines.includes(chat.engine)) return false;
    if (filters.repos.length > 0 && !filters.repos.includes(chat.repoId ?? NO_REPO)) return false;
    if (filters.dates.length > 0 && !filters.dates.includes(chatDateBucket(chat.updatedAt, now))) return false;
    if (filters.pinned.length > 0 && !filters.pinned.includes(chat.pinned ? 'pinned' : 'unpinned')) return false;
    if (needle.length > 0 && !searchable(chat).includes(needle)) return false;
    return true;
  });
}

export type ChatGroup = {
  key: string;
  label: string;
  /** Pinned chats sit in their own group above the repo groups. */
  kind: 'pinned' | 'repo' | 'none';
  chats: ChatSummary[];
};

const byRecent = (a: ChatSummary, b: ChatSummary): number => b.updatedAt - a.updatedAt;

/**
 * Pinned chats first, in one group; then one group per repository, the one
 * touched most recently first; chats with no repository last. A pinned chat
 * appears only in the pinned group, never twice.
 */
export function groupChats(chats: readonly ChatSummary[]): ChatGroup[] {
  const pinned = chats.filter((c) => c.pinned).sort(byRecent);
  const rest = chats.filter((c) => !c.pinned);

  const repos = new Map<string, ChatGroup>();
  const none: ChatSummary[] = [];
  for (const chat of rest) {
    if (chat.repoId === null) {
      none.push(chat);
      continue;
    }
    const group = repos.get(chat.repoId) ?? { key: chat.repoId, label: chat.repoName ?? chat.repoId, kind: 'repo' as const, chats: [] };
    group.chats.push(chat);
    repos.set(chat.repoId, group);
  }

  const repoGroups = [...repos.values()]
    .map((g) => ({ ...g, chats: g.chats.sort(byRecent) }))
    .sort((a, b) => byRecent(a.chats[0]!, b.chats[0]!));

  return [
    ...(pinned.length > 0 ? [{ key: PINNED_GROUP, label: 'Pinned', kind: 'pinned' as const, chats: pinned }] : []),
    ...repoGroups,
    ...(none.length > 0 ? [{ key: NO_REPO, label: 'No repository', kind: 'none' as const, chats: none.sort(byRecent) }] : []),
  ];
}
