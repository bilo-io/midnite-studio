import { ANIMATION_SOURCE_LABELS, type AnimationClip, type AnimationSource } from '@midnite/studio-shared';

/**
 * The Animations list's logic (Phase 125 Theme C), pure so it is tested without a DOM: search, tag and source
 * filters, sort, and the counts the explorer shows beside each filter.
 */

export const CLIP_SORTS = ['name', 'newest', 'duration', 'size'] as const;
export type ClipSort = (typeof CLIP_SORTS)[number];

export const CLIP_SORT_LABELS: Record<ClipSort, string> = {
  name: 'Name',
  newest: 'Newest first',
  duration: 'Longest first',
  size: 'Largest first',
};

export type ClipFilter = {
  query: string;
  /** Every one of these tags must be on the clip. */
  tags: readonly string[];
  source: AnimationSource | 'all';
  sort: ClipSort;
};

export const DEFAULT_CLIP_FILTER: ClipFilter = { query: '', tags: [], source: 'all', sort: 'name' };

/** What a search reads: the name, tags, author, site and the source's label — lower-cased. */
function haystack(clip: AnimationClip): string {
  return [clip.name, clip.tags.join(' '), clip.author, clip.site ?? '', ANIMATION_SOURCE_LABELS[clip.source], clip.format].join(' ').toLowerCase();
}

/** Every whitespace-separated word of `query` must appear somewhere in the clip's text. */
export function matchesQuery(clip: AnimationClip, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = haystack(clip);
  return words.every((word) => text.includes(word));
}

const byName = (a: AnimationClip, b: AnimationClip) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) || a.id.localeCompare(b.id);

const COMPARE: Record<ClipSort, (a: AnimationClip, b: AnimationClip) => number> = {
  name: byName,
  newest: (a, b) => b.addedAt - a.addedAt || byName(a, b),
  // An unknown duration sorts last whichever way the rest go.
  duration: (a, b) => (b.durationSec ?? -1) - (a.durationSec ?? -1) || byName(a, b),
  size: (a, b) => b.sizeBytes - a.sizeBytes || byName(a, b),
};

export function filterClips(clips: readonly AnimationClip[], filter: ClipFilter): AnimationClip[] {
  return clips
    .filter((clip) => (filter.source === 'all' || clip.source === filter.source) && filter.tags.every((tag) => clip.tags.includes(tag)) && matchesQuery(clip, filter.query))
    .sort(COMPARE[filter.sort]);
}

/** Tags with how many of `clips` carry each, most used first. */
export function tagCounts(clips: readonly AnimationClip[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const clip of clips) for (const tag of clip.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Sources that have at least one clip, with their counts, most used first. */
export function sourceCounts(clips: readonly AnimationClip[]): { source: AnimationSource; count: number }[] {
  const counts = new Map<AnimationSource, number>();
  for (const clip of clips) counts.set(clip.source, (counts.get(clip.source) ?? 0) + 1);
  return [...counts].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Adds `tag` (normalised the way the schema does) to `tags`, or returns `tags` unchanged for an empty or repeated one. */
export function withTag(tags: readonly string[], raw: string): string[] {
  const tag = raw.trim().toLowerCase().replace(/\s+/g, '-');
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(tag) || tags.includes(tag)) return [...tags];
  return [...tags, tag];
}

/** What an import did, as one line: `Added 5 · 2 already in the library · 1 failed`. */
export function importSummaryLine(result: { added: readonly unknown[]; duplicates: readonly unknown[]; failed: readonly unknown[]; cancelled?: boolean }): string {
  if (result.cancelled) return 'Import cancelled';
  const parts = [
    result.added.length > 0 ? `Added ${result.added.length}` : null,
    result.duplicates.length > 0 ? `${result.duplicates.length} already in the library` : null,
    result.failed.length > 0 ? `${result.failed.length} failed` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Nothing to import';
}
