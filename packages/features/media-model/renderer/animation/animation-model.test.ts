import { describe, expect, it } from 'vitest';

import { DEFAULT_CLIP_FILTER, filterClips, formatBytes, importSummaryLine, matchesQuery, sourceCounts, tagCounts, withTag, type ClipFilter } from './animation-model';
import { SAMPLE_CLIPS } from './test-clips';

const names = (filter: Partial<ClipFilter>) => filterClips(SAMPLE_CLIPS, { ...DEFAULT_CLIP_FILTER, ...filter }).map((c) => c.name);

describe('filterClips', () => {
  it('lists every clip by name by default', () => {
    expect(names({})).toEqual(['Idle Breathing', 'Run Forward', 'Sword Slash', 'Walking']);
  });

  it('matches every word of the query, in any of the searched fields', () => {
    expect(names({ query: 'run' })).toEqual(['Run Forward']);
    expect(names({ query: 'LOCOMOTION walk' })).toEqual(['Walking']);
    expect(names({ query: 'ana' })).toEqual(['Idle Breathing']);
    expect(names({ query: 'sketchfab glb' })).toEqual(['Idle Breathing']);
    expect(names({ query: 'nothing like it' })).toEqual([]);
  });

  it('requires every selected tag', () => {
    expect(names({ tags: ['locomotion'] })).toEqual(['Run Forward', 'Walking']);
    expect(names({ tags: ['locomotion', 'in-place'] })).toEqual(['Run Forward']);
    expect(names({ tags: ['locomotion', 'combat'] })).toEqual([]);
  });

  it('filters by source', () => {
    expect(names({ source: 'sketchfab' })).toEqual(['Idle Breathing']);
    expect(names({ source: 'cmu' })).toEqual([]);
  });

  it('sorts by newest, duration (unknown last) and size', () => {
    expect(names({ sort: 'newest' })).toEqual(['Run Forward', 'Walking', 'Idle Breathing', 'Sword Slash']);
    expect(names({ sort: 'duration' })).toEqual(['Sword Slash', 'Walking', 'Run Forward', 'Idle Breathing']);
    expect(names({ sort: 'size' })).toEqual(['Sword Slash', 'Walking', 'Run Forward', 'Idle Breathing']);
  });

  it('does not reorder the caller’s array', () => {
    const before = SAMPLE_CLIPS.map((c) => c.id);
    filterClips(SAMPLE_CLIPS, { ...DEFAULT_CLIP_FILTER, sort: 'size' });
    expect(SAMPLE_CLIPS.map((c) => c.id)).toEqual(before);
  });
});

describe('matchesQuery', () => {
  it('treats a blank query as a match', () => {
    expect(matchesQuery(SAMPLE_CLIPS[0]!, '   ')).toBe(true);
  });
});

describe('counts', () => {
  it('counts tags, most used first', () => {
    expect(tagCounts(SAMPLE_CLIPS)).toEqual([
      { tag: 'locomotion', count: 2 },
      { tag: 'combat', count: 1 },
      { tag: 'idle', count: 1 },
      { tag: 'in-place', count: 1 },
    ]);
  });

  it('counts sources that have clips', () => {
    expect(sourceCounts(SAMPLE_CLIPS)).toEqual([
      { source: 'mixamo', count: 3 },
      { source: 'sketchfab', count: 1 },
    ]);
  });
});

describe('withTag', () => {
  it('normalises a tag and appends it', () => {
    expect(withTag(['idle'], '  Hand Wave ')).toEqual(['idle', 'hand-wave']);
  });

  it('ignores blank, repeated and invalid tags', () => {
    expect(withTag(['idle'], '   ')).toEqual(['idle']);
    expect(withTag(['idle'], 'IDLE')).toEqual(['idle']);
    expect(withTag(['idle'], '!!')).toEqual(['idle']);
  });
});

describe('formatBytes', () => {
  it('scales B, KB and MB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('importSummaryLine', () => {
  it('summarises each outcome', () => {
    expect(importSummaryLine({ added: [1, 2], duplicates: [1], failed: [1], cancelled: false })).toBe('Added 2 · 1 already in the library · 1 failed');
    expect(importSummaryLine({ added: [], duplicates: [], failed: [], cancelled: false })).toBe('Nothing to import');
    expect(importSummaryLine({ added: [], duplicates: [], failed: [], cancelled: true })).toBe('Import cancelled');
  });
});
