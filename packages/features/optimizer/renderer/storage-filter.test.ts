import type { ScanItem } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import {
  EMPTY_STORAGE_FILTER,
  filterScanItems,
  sortScanItems,
  toggleFacet,
} from './storage-filter';

const item = (over: Partial<ScanItem>): ScanItem => ({
  path: '/repo/dist',
  bytes: 100,
  category: 'buildOutput',
  repoId: 'repo-1',
  detectorId: 'node-dist',
  ecosystem: 'node',
  reclaim: 'cheap',
  ...over,
});

const LABELS: Record<string, string> = {
  'node-dist': 'dist/',
  'py-venv': 'Virtualenv',
};
const label = (i: ScanItem) => LABELS[i.detectorId] ?? i.detectorId;

describe('filterScanItems', () => {
  const items = [
    item({}),
    item({ path: '/repo/.venv', detectorId: 'py-venv', ecosystem: 'python', category: 'dependencies' }),
    item({ path: '/other/target', detectorId: 'rust-target', ecosystem: 'rust' }),
  ];

  it('an empty filter means everything, not nothing', () => {
    expect(filterScanItems(items, EMPTY_STORAGE_FILTER, label)).toHaveLength(3);
  });

  it('narrows to the selected ecosystems', () => {
    const kept = filterScanItems(items, { ...EMPTY_STORAGE_FILTER, ecosystems: ['python', 'rust'] }, label);
    expect(kept.map((i) => i.path)).toEqual(['/repo/.venv', '/other/target']);
  });

  it('narrows to the selected categories', () => {
    const kept = filterScanItems(items, { ...EMPTY_STORAGE_FILTER, categories: ['dependencies'] }, label);
    expect(kept.map((i) => i.path)).toEqual(['/repo/.venv']);
  });

  it('ANDs the two facets rather than unioning them', () => {
    const kept = filterScanItems(
      items,
      { ...EMPTY_STORAGE_FILTER, ecosystems: ['python'], categories: ['buildOutput'] },
      label,
    );
    expect(kept).toEqual([]);
  });

  it('matches the query against the path', () => {
    const kept = filterScanItems(items, { ...EMPTY_STORAGE_FILTER, query: 'OTHER' }, label);
    expect(kept.map((i) => i.path)).toEqual(['/other/target']);
  });

  it('matches the query against the detector label, not only the path', () => {
    // "Virtualenv" appears nowhere in `/repo/.venv` — someone typing what the
    // row says has to find the row.
    const kept = filterScanItems(items, { ...EMPTY_STORAGE_FILTER, query: 'virtualenv' }, label);
    expect(kept.map((i) => i.path)).toEqual(['/repo/.venv']);
  });
});

describe('toggleFacet', () => {
  it('adds a value that is absent and removes one that is present', () => {
    expect(toggleFacet(['node'], 'python')).toEqual(['node', 'python']);
    expect(toggleFacet(['node', 'python'], 'node')).toEqual(['python']);
  });
});

describe('sortScanItems', () => {
  const items = [item({ path: '/b', bytes: 10 }), item({ path: '/a', bytes: 500 }), item({ path: '/c', bytes: 10 })];

  it('sorts biggest first, breaking ties on path so renders are stable', () => {
    expect(sortScanItems(items, 'size-desc').map((i) => i.path)).toEqual(['/a', '/b', '/c']);
  });

  it('sorts smallest first', () => {
    expect(sortScanItems(items, 'size-asc').map((i) => i.path)).toEqual(['/b', '/c', '/a']);
  });

  it('sorts by path', () => {
    expect(sortScanItems(items, 'name').map((i) => i.path)).toEqual(['/a', '/b', '/c']);
  });

  it('does not mutate its input', () => {
    const before = [...items];
    sortScanItems(items, 'size-asc');
    expect(items).toEqual(before);
  });
});
