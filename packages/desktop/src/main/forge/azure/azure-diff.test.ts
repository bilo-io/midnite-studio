import { describe, expect, it } from 'vitest';

import { buildFileDiffText, buildUnifiedHunks, diffLines } from './azure-diff';

describe('diffLines', () => {
  it('reports no ops difference for identical content', () => {
    const ops = diffLines(['a', 'b'], ['a', 'b']);
    expect(ops).toEqual([
      { type: 'equal', line: 'a' },
      { type: 'equal', line: 'b' },
    ]);
  });

  it('reports a pure addition', () => {
    const ops = diffLines([], ['a', 'b']);
    expect(ops).toEqual([
      { type: 'add', line: 'a' },
      { type: 'add', line: 'b' },
    ]);
  });

  it('reports a pure deletion', () => {
    const ops = diffLines(['a', 'b'], []);
    expect(ops).toEqual([
      { type: 'del', line: 'a' },
      { type: 'del', line: 'b' },
    ]);
  });

  it('finds a minimal edit script for a single changed line', () => {
    const ops = diffLines(['a', 'b', 'c'], ['a', 'x', 'c']);
    expect(ops).toEqual([
      { type: 'equal', line: 'a' },
      { type: 'del', line: 'b' },
      { type: 'add', line: 'x' },
      { type: 'equal', line: 'c' },
    ]);
  });

  it('bails out with null past the cell cap rather than hanging', () => {
    const big = Array.from({ length: 3000 }, (_, i) => `line-${i}`);
    expect(diffLines(big, big)).toBeNull();
  });
});

describe('buildUnifiedHunks', () => {
  it('produces no hunks when nothing changed', () => {
    expect(buildUnifiedHunks([{ type: 'equal', line: 'a' }], 3)).toEqual([]);
  });

  it('produces one hunk with correct line numbers for a single change', () => {
    const ops = diffLines(['a', 'b', 'c'], ['a', 'x', 'c'])!;
    const hunks = buildUnifiedHunks(ops, 3);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toContain('@@ -1,3 +1,3 @@');
    expect(hunks[0]).toContain(' a');
    expect(hunks[0]).toContain('-b');
    expect(hunks[0]).toContain('+x');
    expect(hunks[0]).toContain(' c');
  });

  it('splits two far-apart changes into two hunks', () => {
    const oldLines = ['a', ...Array.from({ length: 20 }, () => 'ctx'), 'z'];
    const newLines = ['A', ...Array.from({ length: 20 }, () => 'ctx'), 'Z'];
    const ops = diffLines(oldLines, newLines)!;
    const hunks = buildUnifiedHunks(ops, 3);
    expect(hunks).toHaveLength(2);
  });

  it('merges two nearby changes into one hunk', () => {
    const oldLines = ['a', 'ctx1', 'ctx2', 'b'];
    const newLines = ['A', 'ctx1', 'ctx2', 'B'];
    const ops = diffLines(oldLines, newLines)!;
    const hunks = buildUnifiedHunks(ops, 3);
    expect(hunks).toHaveLength(1);
  });
});

describe('buildFileDiffText', () => {
  it('builds a diff --git header with hunks for an edited file', () => {
    const text = buildFileDiffText('a.txt', 'a.txt', 'one\ntwo\nthree\n', 'one\nTWO\nthree\n', 'edit', 3);
    expect(text).toContain('diff --git a/a.txt b/a.txt');
    expect(text).toContain('--- a/a.txt');
    expect(text).toContain('+++ b/a.txt');
    expect(text).toContain('-two');
    expect(text).toContain('+TWO');
  });

  it('diffs an added file against /dev/null', () => {
    const text = buildFileDiffText('new.txt', 'new.txt', null, 'hello\n', 'add', 3);
    expect(text).toContain('new file mode 100644');
    expect(text).toContain('--- /dev/null');
    expect(text).toContain('+hello');
  });

  it('diffs a deleted file against /dev/null', () => {
    const text = buildFileDiffText('gone.txt', 'gone.txt', 'bye\n', null, 'delete', 3);
    expect(text).toContain('deleted file mode 100644');
    expect(text).toContain('+++ /dev/null');
    expect(text).toContain('-bye');
  });

  it('carries rename headers with no hunks for a pure rename', () => {
    const text = buildFileDiffText('old-name.txt', 'new-name.txt', 'same\n', 'same\n', 'rename', 3);
    expect(text).toContain('rename from old-name.txt');
    expect(text).toContain('rename to new-name.txt');
    expect(text).not.toContain('@@');
  });

  it('returns null when the diff is too large to compute inline', () => {
    const big = Array.from({ length: 3000 }, (_, i) => `line-${i}`).join('\n');
    expect(buildFileDiffText('huge.txt', 'huge.txt', big, big, 'edit', 3)).toBeNull();
  });
});
