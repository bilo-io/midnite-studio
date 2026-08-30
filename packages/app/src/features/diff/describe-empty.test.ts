import type { FileDiff } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { describeEmptyDiff } from './describe-empty';

const diff = (over: Partial<FileDiff> = {}): FileDiff => ({
  path: 'a.ts',
  oldPath: 'a.ts',
  change: 'modified',
  binary: false,
  combined: false,
  oldMode: null,
  newMode: null,
  hunks: [],
  insertions: 0,
  deletions: 0,
  contextLines: 3,
  truncated: false,
  droppedLines: 0,
  ...over,
});

describe('describeEmptyDiff', () => {
  it('names a binary file, which git refuses to diff textually', () => {
    expect(describeEmptyDiff(diff({ binary: true }))).toBe('Binary file — no textual diff.');
  });

  it('reports a mode-only change, which has no hunks by definition', () => {
    expect(describeEmptyDiff(diff({ oldMode: '100644', newMode: '100755' }))).toBe(
      'Mode changed from 100644 to 100755.',
    );
  });

  it('does not claim a mode change when the modes match', () => {
    expect(describeEmptyDiff(diff({ oldMode: '100644', newMode: '100644' }))).toBe(
      'No changes to show for this file.',
    );
  });

  it('explains a pure rename', () => {
    expect(describeEmptyDiff(diff({ change: 'renamed', oldPath: 'was/here.ts' }))).toBe(
      'Renamed from was/here.ts with no content change.',
    );
  });

  it('does not print a null path when a rename has no recorded source', () => {
    expect(describeEmptyDiff(diff({ change: 'renamed', oldPath: null }))).toBe(
      'Renamed from an earlier path with no content change.',
    );
  });

  it('binary wins over every other reason', () => {
    // A binary file can also be renamed and mode-changed; "no textual diff" is
    // the fact that actually explains the empty pane.
    expect(
      describeEmptyDiff(
        diff({ binary: true, change: 'renamed', oldMode: '100644', newMode: '100755' }),
      ),
    ).toBe('Binary file — no textual diff.');
  });
});
