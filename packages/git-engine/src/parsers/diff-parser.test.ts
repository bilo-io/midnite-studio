import { describe, expect, it } from 'vitest';

import { countDiffLines, parseMultiFileDiff, parseUnifiedDiff } from './diff-parser';

const opts = { contextLines: 3, fallbackPath: 'fallback.ts' };

describe('parseUnifiedDiff — structure', () => {
  it('reads paths, counts and line numbers off a plain modification', () => {
    const diff = parseUnifiedDiff(
      [
        'diff --git a/src/a.ts b/src/a.ts',
        'index 1111111..2222222 100644',
        '--- a/src/a.ts',
        '+++ b/src/a.ts',
        '@@ -10,4 +10,5 @@ export function f() {',
        ' const a = 1;',
        '-const b = 2;',
        '+const b = 3;',
        '+const c = 4;',
        ' return a;',
        '',
      ].join('\n'),
      opts,
    );

    expect(diff.path).toBe('src/a.ts');
    expect(diff.oldPath).toBe('src/a.ts');
    expect(diff.change).toBe('modified');
    expect(diff.insertions).toBe(2);
    expect(diff.deletions).toBe(1);
    expect(diff.hunks).toHaveLength(1);

    const hunk = diff.hunks[0]!;
    expect(hunk.heading).toBe('export function f() {');
    expect(hunk).toMatchObject({ oldStart: 10, oldLines: 4, newStart: 10, newLines: 5 });

    // Old numbers advance on ctx+del, new numbers on ctx+add — never both.
    expect(hunk.lines.map((l) => [l.kind, l.oldNo, l.newNo])).toEqual([
      ['ctx', 10, 10],
      ['del', 11, null],
      ['add', null, 11],
      ['add', null, 12],
      ['ctx', 12, 13],
    ]);
  });

  it('treats an omitted hunk count as 1 (git writes `@@ -5 +5 @@`)', () => {
    const diff = parseUnifiedDiff(
      ['--- a/x', '+++ b/x', '@@ -5 +5 @@', '-old', '+new'].join('\n'),
      opts,
    );
    expect(diff.hunks[0]).toMatchObject({ oldLines: 1, newLines: 1, oldStart: 5, newStart: 5 });
  });

  it('keeps multiple hunks separate and restarts numbering at each', () => {
    const diff = parseUnifiedDiff(
      [
        '--- a/x',
        '+++ b/x',
        '@@ -1,2 +1,2 @@',
        ' one',
        '+two',
        '@@ -50,2 +51,2 @@',
        ' fifty',
        '+fiftyone',
      ].join('\n'),
      opts,
    );
    expect(diff.hunks).toHaveLength(2);
    expect(diff.hunks[0]!.lines[0]!.newNo).toBe(1);
    expect(diff.hunks[1]!.lines[0]!.newNo).toBe(51);
    expect(countDiffLines(diff)).toBe(4);
  });

  it('does not mistake diff-looking source code for a hunk header', () => {
    // A context line always carries its leading space. Without that check, a
    // string literal containing `@@ -1 +1 @@` would open a bogus hunk.
    const diff = parseUnifiedDiff(
      ['--- a/x', '+++ b/x', '@@ -1,3 +1,3 @@', ' const s = "@@ -1 +1 @@";', '-a', '+b'].join(
        '\n',
      ),
      opts,
    );
    expect(diff.hunks).toHaveLength(1);
    expect(diff.hunks[0]!.lines[0]!.text).toBe('const s = "@@ -1 +1 @@";');
  });
});

describe('parseUnifiedDiff — body lines that look like headers', () => {
  // Inside a hunk, `+`/`-`/` ` is the ONLY thing separating content from
  // structure. Treating these as file headers silently drops the line,
  // under-counts the change, clobbers the paths, and shifts every following
  // line number — a diff that lies about what a commit did.

  it('keeps a deleted line whose content starts with a comment marker', () => {
    const d = parseUnifiedDiff(
      [
        '--- a/q.sql',
        '+++ b/q.sql',
        '@@ -1,3 +1,2 @@',
        ' select 1;',
        '--- pick the newest row',
        ' select 2;',
      ].join('\n'),
      { ...opts, fallbackPath: 'q.sql' },
    );

    expect(d.deletions).toBe(1);
    expect(d.oldPath).toBe('q.sql');
    expect(d.hunks[0]!.lines.map((l) => [l.kind, l.oldNo, l.newNo, l.text])).toEqual([
      ['ctx', 1, 1, 'select 1;'],
      ['del', 2, null, '-- pick the newest row'],
      // Line 3 in the pre-image, not 2 — this is what the bug shifted.
      ['ctx', 3, 2, 'select 2;'],
    ]);
  });

  it('keeps an added line whose content starts with ++', () => {
    const d = parseUnifiedDiff(
      ['--- a/x.md', '+++ b/x.md', '@@ -1,1 +1,2 @@', ' text', '+++ nested marker'].join('\n'),
      { ...opts, fallbackPath: 'x.md' },
    );

    expect(d.insertions).toBe(1);
    expect(d.path).toBe('x.md');
    expect(d.hunks[0]!.lines[1]).toMatchObject({ kind: 'add', text: '++ nested marker' });
  });

  it('does not read a mode header out of a deleted line of prose', () => {
    const d = parseUnifiedDiff(
      ['--- a/README.md', '+++ b/README.md', '@@ -1,1 +1,1 @@', '-old mode 100644 was here', '+gone'].join(
        '\n',
      ),
      { ...opts, fallbackPath: 'README.md' },
    );
    expect(d.oldMode).toBeNull();
    expect(d.deletions).toBe(1);
  });
});

describe('parseUnifiedDiff — combined diffs (unmerged paths)', () => {
  // `git diff` on a conflicted path emits `@@@` with one marker COLUMN per
  // parent. An `^@@ -`-anchored parser matches none of it, so the whole section
  // falls through as unstructured text and the pane reports "no changes" for
  // the one file the user most needs mid-merge.
  const conflicted = [
    'diff --cc f.txt',
    'index 1111111,2222222..0000000',
    '--- a/f.txt',
    '+++ b/f.txt',
    '@@@ -1,3 -1,3 +1,7 @@@',
    '  a',
    '++<<<<<<< HEAD',
    ' +MAIN',
    '++=======',
    '+ FEATURE',
    '++>>>>>>> feature',
    '  c',
  ].join('\n');

  it('flags the diff as combined', () => {
    expect(parseUnifiedDiff(conflicted, { ...opts, fallbackPath: 'f.txt' }).combined).toBe(true);
  });

  it('keeps every body line, conflict markers included', () => {
    const d = parseUnifiedDiff(conflicted, { ...opts, fallbackPath: 'f.txt' });
    const lines = d.hunks[0]!.lines;

    expect(lines.map((l) => l.text)).toEqual([
      'a',
      '<<<<<<< HEAD',
      'MAIN',
      '=======',
      'FEATURE',
      '>>>>>>> feature',
      'c',
    ]);
    // Both marker columns are stripped — one per parent, not just the first.
    expect(lines.every((l) => !l.text.startsWith('+') && !l.text.startsWith('-'))).toBe(true);
  });

  it('classifies a line as added when any parent lacks it', () => {
    const d = parseUnifiedDiff(conflicted, { ...opts, fallbackPath: 'f.txt' });
    expect(d.hunks[0]!.lines.map((l) => l.kind)).toEqual([
      'ctx',
      'add',
      'add',
      'add',
      'add',
      'add',
      'ctx',
    ]);
  });

  it('reads the first parent\'s range for the old-side numbers', () => {
    // A combined header carries one `-` range per parent. The old numbers can
    // only describe one of them, and the first parent is the branch merged into.
    const d = parseUnifiedDiff(conflicted, { ...opts, fallbackPath: 'f.txt' });
    expect(d.hunks[0]).toMatchObject({ oldStart: 1, oldLines: 3, newStart: 1, newLines: 7 });
    expect(d.hunks[0]!.lines[0]).toMatchObject({ oldNo: 1, newNo: 1 });
  });

  it('leaves an ordinary two-way diff unflagged', () => {
    const d = parseUnifiedDiff(
      ['--- a/x', '+++ b/x', '@@ -1,1 +1,1 @@', '-a', '+b'].join('\n'),
      opts,
    );
    expect(d.combined).toBe(false);
  });
});

describe('parseUnifiedDiff — multi-section patches', () => {
  // A two-path pathspec (see commands/diff.ts) yields two sections whenever
  // `-M` fails to pair the rename. Concatenating them would put hunks and line
  // numbers from two different files under one path.
  const twoSections = [
    'diff --git a/old.txt b/old.txt',
    'deleted file mode 100644',
    '--- a/old.txt',
    '+++ /dev/null',
    '@@ -1,1 +0,0 @@',
    '-gone',
    'diff --git a/new.txt b/new.txt',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/new.txt',
    '@@ -0,0 +1,1 @@',
    '+fresh',
  ].join('\n');

  it('returns the section describing the requested path', () => {
    const d = parseUnifiedDiff(twoSections, { ...opts, fallbackPath: 'new.txt' });
    expect(d.path).toBe('new.txt');
    expect(d.change).toBe('added');
    expect(d.insertions).toBe(1);
    expect(d.deletions).toBe(0);
    expect(d.hunks).toHaveLength(1);
  });

  it('matches on the pre-image path too', () => {
    const d = parseUnifiedDiff(twoSections, { ...opts, fallbackPath: 'old.txt' });
    expect(d.change).toBe('deleted');
    expect(d.deletions).toBe(1);
    expect(d.insertions).toBe(0);
  });

  it('falls back to the first section when nothing matches', () => {
    const d = parseUnifiedDiff(twoSections, { ...opts, fallbackPath: 'unrelated.txt' });
    expect(d.path).toBe('old.txt');
  });
});

describe('parseUnifiedDiff — file-level change kinds', () => {
  it('classifies an addition and leaves oldPath null', () => {
    const diff = parseUnifiedDiff(
      [
        'diff --git a/new.ts b/new.ts',
        'new file mode 100644',
        '--- /dev/null',
        '+++ b/new.ts',
        '@@ -0,0 +1,1 @@',
        '+hello',
      ].join('\n'),
      opts,
    );
    expect(diff.change).toBe('added');
    expect(diff.oldPath).toBeNull();
    expect(diff.newMode).toBe('100644');
  });

  it('classifies a deletion', () => {
    const diff = parseUnifiedDiff(
      [
        'diff --git a/gone.ts b/gone.ts',
        'deleted file mode 100644',
        '--- a/gone.ts',
        '+++ /dev/null',
        '@@ -1,1 +0,0 @@',
        '-bye',
      ].join('\n'),
      opts,
    );
    expect(diff.change).toBe('deleted');
    expect(diff.path).toBe('gone.ts');
    expect(diff.deletions).toBe(1);
  });

  it('classifies a rename and keeps both paths', () => {
    const diff = parseUnifiedDiff(
      [
        'diff --git a/old/name.ts b/new/name.ts',
        'similarity index 96%',
        'rename from old/name.ts',
        'rename to new/name.ts',
        '--- a/old/name.ts',
        '+++ b/new/name.ts',
        '@@ -1,1 +1,1 @@',
        '-a',
        '+b',
      ].join('\n'),
      opts,
    );
    expect(diff.change).toBe('renamed');
    expect(diff.oldPath).toBe('old/name.ts');
    expect(diff.path).toBe('new/name.ts');
  });

  it('flags a binary file and produces no hunks', () => {
    const diff = parseUnifiedDiff(
      [
        'diff --git a/logo.png b/logo.png',
        'index 1111111..2222222 100644',
        'Binary files a/logo.png and b/logo.png differ',
      ].join('\n'),
      opts,
    );
    expect(diff.binary).toBe(true);
    expect(diff.hunks).toEqual([]);
  });

  it('reports a mode-only change, which has no hunks at all', () => {
    const diff = parseUnifiedDiff(
      [
        'diff --git a/run.sh b/run.sh',
        'old mode 100644',
        'new mode 100755',
      ].join('\n'),
      opts,
    );
    expect(diff.hunks).toEqual([]);
    expect(diff.oldMode).toBe('100644');
    expect(diff.newMode).toBe('100755');
  });

  it('survives an empty patch', () => {
    const diff = parseUnifiedDiff('', opts);
    expect(diff.path).toBe('fallback.ts');
    expect(diff.hunks).toEqual([]);
    expect(diff.insertions + diff.deletions).toBe(0);
  });

  it('attaches "\\ No newline at end of file" to the line before it', () => {
    const diff = parseUnifiedDiff(
      ['--- a/x', '+++ b/x', '@@ -1,1 +1,1 @@', '-a', '\\ No newline at end of file', '+a'].join(
        '\n',
      ),
      opts,
    );
    const [del, add] = diff.hunks[0]!.lines;
    expect(del!.noNewline).toBe(true);
    expect(add!.noNewline).toBe(false);
    // The marker must not be counted as a body line of its own.
    expect(diff.hunks[0]!.lines).toHaveLength(2);
  });
});

describe('parseUnifiedDiff — truncation', () => {
  it('stops at maxLines and reports how many it dropped', () => {
    const body = Array.from({ length: 50 }, (_, i) => `+line ${i}`);
    const diff = parseUnifiedDiff(
      ['--- a/x', '+++ b/x', '@@ -0,0 +1,50 @@', ...body].join('\n'),
      { ...opts, maxLines: 10 },
    );

    expect(diff.truncated).toBe(true);
    expect(countDiffLines(diff)).toBe(10);
    expect(diff.droppedLines).toBe(40);
  });

  it('counts every change, not just the ones that fit', () => {
    // The header renders these next to "N more lines not shown"; a count that
    // shrank to what happened to fit would contradict the notice beside it.
    const body = Array.from({ length: 50 }, (_, i) => `+line ${i}`);
    const diff = parseUnifiedDiff(
      ['--- a/x', '+++ b/x', '@@ -0,0 +1,50 @@', ...body].join('\n'),
      { ...opts, maxLines: 10 },
    );
    expect(diff.insertions).toBe(50);
  });

  it('emits no empty hunks, which would render a useless expander', () => {
    const diff = parseUnifiedDiff(
      [
        '--- a/x',
        '+++ b/x',
        '@@ -1,2 +1,2 @@',
        '-a',
        '+b',
        '@@ -50,2 +50,2 @@',
        '-c',
        '+d',
      ].join('\n'),
      { ...opts, maxLines: 2 },
    );

    expect(diff.hunks).toHaveLength(1);
    expect(diff.hunks.every((h) => h.lines.length > 0)).toBe(true);
  });

  it('does not pin the no-newline marker onto a line it does not belong to', () => {
    const diff = parseUnifiedDiff(
      ['--- a/x', '+++ b/x', '@@ -1,3 +1,3 @@', '-a', '-b', '-c', '\\ No newline at end of file'].join(
        '\n',
      ),
      { ...opts, maxLines: 1 },
    );
    // Only 'a' survived the cap, and the marker belonged to 'c'.
    expect(diff.hunks[0]!.lines).toHaveLength(1);
    expect(diff.hunks[0]!.lines[0]!.noNewline).toBe(false);
  });

  it('leaves truncated false when the diff fits', () => {
    const diff = parseUnifiedDiff(
      ['--- a/x', '+++ b/x', '@@ -0,0 +1,1 @@', '+one'].join('\n'),
      { ...opts, maxLines: 10 },
    );
    expect(diff.truncated).toBe(false);
    expect(diff.droppedLines).toBe(0);
  });
});

describe('intraline word diff', () => {
  const single = (before: string, after: string) =>
    parseUnifiedDiff(
      ['--- a/x', '+++ b/x', '@@ -1,1 +1,1 @@', `-${before}`, `+${after}`].join('\n'),
      opts,
    ).hunks[0]!.lines;

  const slice = (text: string, ranges: ReadonlyArray<{ start: number; end: number }>) =>
    ranges.map((r) => text.slice(r.start, r.end));

  it('marks only the word that changed', () => {
    const [del, add] = single('const value = compute(a);', 'const value = compute(b);');
    expect(slice(del!.text, del!.ranges)).toEqual(['a']);
    expect(slice(add!.text, add!.ranges)).toEqual(['b']);
  });

  it('treats punctuation as its own token', () => {
    const [del, add] = single('f(x)', 'f[x]');
    expect(slice(del!.text, del!.ranges)).toEqual(['(', ')']);
    expect(slice(add!.text, add!.ranges)).toEqual(['[', ']']);
  });

  it('marks an insertion in the middle of a line', () => {
    const [, add] = single('a c', 'a b c');
    expect(slice(add!.text, add!.ranges).join('')).toContain('b');
  });

  it('gives up on a whole-line rewrite rather than highlighting everything', () => {
    // Below MIN_SHARED_RATIO the highlight would cover the line, which reads as
    // noise on top of the row tint rather than as information.
    const [del, add] = single('alpha beta gamma', 'zulu yankee xray');
    expect(del!.ranges).toEqual([]);
    expect(add!.ranges).toEqual([]);
  });

  it('leaves an unbalanced run unmarked — there is no honest 1:1 pairing', () => {
    const lines = parseUnifiedDiff(
      ['--- a/x', '+++ b/x', '@@ -1,2 +1,3 @@', '-a 1', '-b 2', '+a 9', '+b 8', '+c 7'].join('\n'),
      opts,
    ).hunks[0]!.lines;
    expect(lines.every((l) => l.ranges.length === 0)).toBe(true);
  });

  it('pairs each line of a balanced multi-line run positionally', () => {
    const lines = parseUnifiedDiff(
      ['--- a/x', '+++ b/x', '@@ -1,2 +1,2 @@', '-let x = 1;', '-let y = 2;', '+let x = 8;', '+let y = 9;'].join(
        '\n',
      ),
      opts,
    ).hunks[0]!.lines;

    expect(slice(lines[2]!.text, lines[2]!.ranges)).toEqual(['8']);
    expect(slice(lines[3]!.text, lines[3]!.ranges)).toEqual(['9']);
  });

  it('never marks context lines', () => {
    const lines = parseUnifiedDiff(
      ['--- a/x', '+++ b/x', '@@ -1,3 +1,3 @@', ' keep me', '-a 1', '+a 2'].join('\n'),
      opts,
    ).hunks[0]!.lines;
    expect(lines[0]!.ranges).toEqual([]);
  });

  it('produces ranges that stay inside the line', () => {
    const [del, add] = single('const timeoutMs = 500;', 'const timeoutMs = 1500;');
    for (const line of [del!, add!]) {
      for (const range of line.ranges) {
        expect(range.start).toBeGreaterThanOrEqual(0);
        expect(range.end).toBeLessThanOrEqual(line.text.length);
        expect(range.end).toBeGreaterThan(range.start);
      }
    }
  });
});

describe('parseMultiFileDiff', () => {
  const patch = [
    'diff --git a/src/a.ts b/src/a.ts',
    'index 1111111..2222222 100644',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,2 +1,3 @@',
    ' const a = 1;',
    '+const b = 2;',
    ' export { a };',
    'diff --git a/src/old.ts b/src/new.ts',
    'similarity index 90%',
    'rename from src/old.ts',
    'rename to src/new.ts',
    'diff --git a/gone.ts b/gone.ts',
    'deleted file mode 100644',
    '--- a/gone.ts',
    '+++ /dev/null',
    '@@ -1,1 +0,0 @@',
    '-was here',
    '',
  ].join('\n');

  it('returns every section, in the order the patch listed them', () => {
    const files = parseMultiFileDiff(patch, opts);
    expect(files.map((file) => file.path)).toEqual(['src/a.ts', 'src/new.ts', 'gone.ts']);
  });

  it('classifies each section the way the single-file parser would', () => {
    const [modified, renamed, deleted] = parseMultiFileDiff(patch, opts);

    expect(modified?.change).toBe('modified');
    expect(modified?.insertions).toBe(1);
    expect(modified?.hunks).toHaveLength(1);

    expect(renamed?.change).toBe('renamed');
    expect(renamed?.oldPath).toBe('src/old.ts');

    expect(deleted?.change).toBe('deleted');
    expect(deleted?.deletions).toBe(1);
  });

  it('drops the empty trailing section a final newline leaves behind', () => {
    // Every section is a file, so an empty one would render as a phantom diff
    // under the fallback path.
    expect(parseMultiFileDiff(patch, opts)).toHaveLength(3);
    expect(parseMultiFileDiff('', opts)).toEqual([]);
    expect(parseMultiFileDiff('\n\n', opts)).toEqual([]);
  });

  it('numbers the fallback path so header-less sections stay distinguishable', () => {
    // A patch git emitted without `diff --git` headers is one section, and the
    // suffix is what keeps two of them from claiming the same name.
    const headerless = ['@@ -1,1 +1,1 @@', '-a', '+b'].join('\n');
    const [only] = parseMultiFileDiff(headerless, opts);
    expect(only?.path).toBe('fallback.ts#1');
  });

  it('applies the line cap per file, not across the patch', () => {
    // A lockfile first would otherwise exhaust the budget before the files a
    // reviewer opened the PR for were ever parsed.
    const big = (name: string): string =>
      [
        `diff --git a/${name} b/${name}`,
        '--- a/' + name,
        '+++ b/' + name,
        '@@ -1,0 +1,5 @@',
        ...Array.from({ length: 5 }, (_, i) => `+line ${i}`),
      ].join('\n');

    const files = parseMultiFileDiff(`${big('first.ts')}\n${big('second.ts')}`, {
      ...opts,
      maxLines: 3,
    });

    expect(files).toHaveLength(2);
    expect(files[0]?.truncated).toBe(true);
    // The second file gets its own budget rather than inheriting an exhausted one.
    expect(files[1]?.truncated).toBe(true);
    expect(files[1]?.hunks[0]?.lines).toHaveLength(3);
  });
});
