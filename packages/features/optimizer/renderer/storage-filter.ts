import type { Ecosystem, ScanCategory, ScanItem } from '@midnite/studio-shared';

/**
 * The Storage tab's filter and sort, as pure functions.
 *
 * Kept out of the component because they are the part with actual rules in
 * them — an empty facet meaning "everything" rather than "nothing", a query
 * that has to match the detector's label and not only the path — and those
 * are cheap to test here and awkward to test through a rendered tree.
 */

export type StorageFilter = {
  query: string;
  /** Empty means every ecosystem, never none. */
  ecosystems: readonly Ecosystem[];
  /** Empty means every category, never none. */
  categories: readonly ScanCategory[];
};

export const EMPTY_STORAGE_FILTER: StorageFilter = { query: '', ecosystems: [], categories: [] };

export type StorageSort = 'size-desc' | 'size-asc' | 'name';

export function filterScanItems(
  items: readonly ScanItem[],
  filter: StorageFilter,
  /** How a row is titled — the detector label, which the query must match too:
   *  someone typing "node_modules" is naming what they see, not a path. */
  label: (item: ScanItem) => string,
): ScanItem[] {
  const query = filter.query.trim().toLowerCase();
  return items.filter((item) => {
    if (filter.ecosystems.length > 0 && !filter.ecosystems.includes(item.ecosystem)) return false;
    if (filter.categories.length > 0 && !filter.categories.includes(item.category)) return false;
    if (query.length === 0) return true;
    return (
      item.path.toLowerCase().includes(query) || label(item).toLowerCase().includes(query)
    );
  });
}

/** Toggle one member of a facet — the pills' only mutation. */
export function toggleFacet<T>(selected: readonly T[], value: T): T[] {
  return selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
}

export function sortScanItems(items: readonly ScanItem[], sort: StorageSort): ScanItem[] {
  const compare = (a: string, b: string) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  return [...items].sort((a, b) => {
    if (sort === 'name') return compare(a.path, b.path);
    // Ties fall back to path, so the order is stable between renders rather
    // than however `Array#sort` happened to land two equal-sized items.
    const size = sort === 'size-asc' ? a.bytes - b.bytes : b.bytes - a.bytes;
    return size !== 0 ? size : compare(a.path, b.path);
  });
}
