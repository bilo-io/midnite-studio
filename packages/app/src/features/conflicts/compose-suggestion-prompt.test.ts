import { describe, expect, it } from 'vitest';

import type { ConflictStudioItem } from './flatten-conflict-hunks';
import { composeSuggestionPrompt } from './compose-suggestion-prompt';

const ITEMS: ConflictStudioItem[] = [
  { kind: 'context', lines: ['a', 'b', 'c'] },
  { kind: 'conflict', regionIndex: 0, region: { ours: ['MAIN1'], theirs: ['FEAT1'], base: null } },
  { kind: 'context', lines: ['d', 'e'] },
  { kind: 'conflict', regionIndex: 1, region: { ours: ['MAIN2'], theirs: ['FEAT2'], base: ['ORIGINAL2'] } },
];

describe('composeSuggestionPrompt', () => {
  it('includes ours/theirs, the path, and the immediately surrounding context', () => {
    const prompt = composeSuggestionPrompt(ITEMS, 0, 'src/f.txt');

    expect(prompt).toContain('src/f.txt');
    expect(prompt).toContain('Context before:\na\nb\nc');
    expect(prompt).toContain('Ours:\nMAIN1');
    expect(prompt).toContain('Theirs:\nFEAT1');
    expect(prompt).toContain('Context after:\nd\ne');
    expect(prompt).not.toContain('Common ancestor');
  });

  it('includes the diff3 base only when the region has one', () => {
    const prompt = composeSuggestionPrompt(ITEMS, 1, 'src/f.txt');

    expect(prompt).toContain('Common ancestor:\nORIGINAL2');
  });

  it('omits a context section entirely when there is none on that side', () => {
    const soloRegion: ConflictStudioItem[] = [
      { kind: 'conflict', regionIndex: 0, region: { ours: ['A'], theirs: ['B'], base: null } },
    ];

    const prompt = composeSuggestionPrompt(soloRegion, 0, 'f.txt');

    expect(prompt).not.toContain('Context before');
    expect(prompt).not.toContain('Context after');
  });

  it('caps the surrounding context window rather than sending the whole file', () => {
    const longContext: ConflictStudioItem[] = [
      { kind: 'context', lines: Array.from({ length: 40 }, (_, i) => `line-${i}`) },
      { kind: 'conflict', regionIndex: 0, region: { ours: ['A'], theirs: ['B'], base: null } },
    ];

    const prompt = composeSuggestionPrompt(longContext, 0, 'f.txt');

    expect(prompt).not.toContain('line-0\n');
    expect(prompt).toContain('line-39');
  });

  it('renders an empty side explicitly rather than an empty section', () => {
    const emptySide: ConflictStudioItem[] = [
      { kind: 'conflict', regionIndex: 0, region: { ours: [], theirs: ['B'], base: null } },
    ];

    const prompt = composeSuggestionPrompt(emptySide, 0, 'f.txt');

    expect(prompt).toContain('Ours:\n(empty)');
  });

  it('throws for a region index that does not exist', () => {
    expect(() => composeSuggestionPrompt(ITEMS, 5, 'f.txt')).toThrow(/no region 5/);
  });
});
