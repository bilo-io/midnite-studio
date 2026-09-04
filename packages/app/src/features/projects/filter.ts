import type { ForgeProjectItem } from '@midnite/studio-shared';

/**
 * The Projects view's filter state (Phase 52 Theme A) — one toolbar, shared
 * by Table and Board, over the client-side fields `ForgeProjectItem` already
 * carries. Every facet follows `dashboard-store.ts`'s "empty array means
 * everyone" convention, the same one every other facet in this app obeys.
 */
export type ProjectItemFilterState = {
  /** Matched against title, item number and body. */
  query: string;
  assignees: readonly string[];
  labels: readonly string[];
  types: readonly ForgeProjectItem['content']['type'][];
  /** A draft carries no `state` at all — see {@link filterItems}. */
  states: readonly ('open' | 'closed' | 'merged')[];
};

export const EMPTY_PROJECT_ITEM_FILTER: ProjectItemFilterState = {
  query: '',
  assignees: [],
  labels: [],
  types: [],
  states: [],
};

export function isProjectItemFilterEmpty(filter: ProjectItemFilterState): boolean {
  return (
    filter.query.trim().length === 0 &&
    filter.assignees.length === 0 &&
    filter.labels.length === 0 &&
    filter.types.length === 0 &&
    filter.states.length === 0
  );
}

/**
 * Every facet is AND'd against the others; within one facet, any match is
 * enough (OR). Pure so the trickiest case — a draft against a `states`
 * facet — is a unit test rather than something only visible by opening the
 * view: a draft has no `state` field at all, so a non-empty `states` facet
 * excludes it outright, the same way it would exclude an item whose actual
 * state simply isn't selected.
 */
export function filterItems(
  items: readonly ForgeProjectItem[],
  filter: ProjectItemFilterState,
): ForgeProjectItem[] {
  if (isProjectItemFilterEmpty(filter)) return items.slice();

  const needle = filter.query.trim().toLowerCase();

  return items.filter((item) => {
    const content = item.content;

    if (filter.types.length > 0 && !filter.types.includes(content.type)) return false;

    if (filter.states.length > 0) {
      if (content.type === 'draft') return false;
      if (!filter.states.includes(content.state)) return false;
    }

    if (filter.assignees.length > 0 && !content.assignees.some((a) => filter.assignees.includes(a))) {
      return false;
    }

    if (filter.labels.length > 0) {
      const labels = content.type === 'draft' ? [] : content.labels;
      if (!labels.some((l) => filter.labels.includes(l))) return false;
    }

    if (needle.length > 0) {
      const numberText = content.type === 'draft' ? '' : String(content.number);
      const haystack = `${content.title} ${numberText} ${content.body}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    return true;
  });
}

/** Distinct assignee logins across the given items, most-used first. */
export function deriveAssigneeCounts(items: readonly ForgeProjectItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const login of item.content.assignees) counts.set(login, (counts.get(login) ?? 0) + 1);
  }
  return counts;
}

/** Distinct label names across the given items (drafts carry none), most-used first. */
export function deriveLabelCounts(items: readonly ForgeProjectItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.content.type === 'draft') continue;
    for (const label of item.content.labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return counts;
}
