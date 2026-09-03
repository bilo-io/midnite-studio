import { describe, expect, it } from 'vitest';

import { parseConflictMarkers, parseConflictedFile } from './conflict-parser';

describe('parseConflictMarkers — default (2-way) conflict style', () => {
  it('splits context from the conflicted region', () => {
    const result = parseConflictMarkers([
      'a',
      '<<<<<<< HEAD',
      'MAIN',
      '=======',
      'FEATURE',
      '>>>>>>> feature',
      'c',
    ]);

    expect(result.segments).toEqual([
      { kind: 'context', lines: ['a'] },
      { kind: 'conflict', region: { ours: ['MAIN'], theirs: ['FEATURE'], base: null } },
      { kind: 'context', lines: ['c'] },
    ]);
  });

  it('handles multi-line ours/theirs and more than one conflict in the same hunk', () => {
    const result = parseConflictMarkers([
      '<<<<<<< HEAD',
      'main 1',
      'main 2',
      '=======',
      'feature 1',
      '>>>>>>> feature',
      'shared',
      '<<<<<<< HEAD',
      'x',
      '=======',
      'y',
      '>>>>>>> feature',
    ]);

    expect(result.segments).toEqual([
      {
        kind: 'conflict',
        region: { ours: ['main 1', 'main 2'], theirs: ['feature 1'], base: null },
      },
      { kind: 'context', lines: ['shared'] },
      { kind: 'conflict', region: { ours: ['x'], theirs: ['y'], base: null } },
    ]);
  });
});

describe('parseConflictMarkers — diff3 conflict style', () => {
  it('captures the ancestor between ||||||| and =======', () => {
    const result = parseConflictMarkers([
      '<<<<<<< HEAD',
      'MAIN',
      '||||||| base',
      'ORIGINAL',
      '=======',
      'FEATURE',
      '>>>>>>> feature',
    ]);

    expect(result.segments).toEqual([
      {
        kind: 'conflict',
        region: { ours: ['MAIN'], theirs: ['FEATURE'], base: ['ORIGINAL'] },
      },
    ]);
  });
});

describe('parseConflictMarkers — no markers', () => {
  it('parses to zero conflict regions rather than throwing', () => {
    const result = parseConflictMarkers(['just', 'plain', 'text']);

    expect(result.segments).toEqual([{ kind: 'context', lines: ['just', 'plain', 'text'] }]);
    expect(result.segments.filter((s) => s.kind === 'conflict')).toHaveLength(0);
  });

  it('parses an empty file to zero segments', () => {
    expect(parseConflictMarkers([]).segments).toEqual([]);
  });
});

describe('parseConflictedFile', () => {
  it('parses each hunk independently', () => {
    const hunks = [
      {
        oldStart: 1,
        oldLines: 1,
        newStart: 1,
        newLines: 3,
        heading: '',
        lines: [
          { kind: 'add' as const, oldNo: null, newNo: 1, text: '<<<<<<< HEAD', ranges: [], noNewline: false },
          { kind: 'add' as const, oldNo: null, newNo: 2, text: 'MAIN', ranges: [], noNewline: false },
          { kind: 'add' as const, oldNo: null, newNo: 3, text: '=======', ranges: [], noNewline: false },
          { kind: 'add' as const, oldNo: null, newNo: 4, text: 'FEATURE', ranges: [], noNewline: false },
          { kind: 'add' as const, oldNo: null, newNo: 5, text: '>>>>>>> feature', ranges: [], noNewline: false },
        ],
      },
    ];

    const [hunk] = parseConflictedFile(hunks);
    expect(hunk!.segments).toEqual([
      { kind: 'conflict', region: { ours: ['MAIN'], theirs: ['FEATURE'], base: null } },
    ]);
  });
});
