import { describe, expect, it } from 'vitest';

import { parseStatus } from './status-parser';

/** Join porcelain-v2 records the way `-z` emits them: NUL-terminated. */
const z = (...lines: string[]) => lines.map((l) => `${l}\x00`).join('');

describe('parseStatus — branch headers', () => {
  it('reads head, oid, upstream and ahead/behind', () => {
    const { branch } = parseStatus(
      z(
        '# branch.oid 1111111111111111111111111111111111111111',
        '# branch.head main',
        '# branch.upstream origin/main',
        '# branch.ab +3 -1',
      ),
    );

    expect(branch).toEqual({
      head: 'main',
      oid: '1111111111111111111111111111111111111111',
      upstream: 'origin/main',
      ahead: 3,
      behind: 1,
      unborn: false,
      detached: false,
    });
  });

  it('flags a detached HEAD', () => {
    const { branch } = parseStatus(z('# branch.head (detached)'));
    expect(branch.detached).toBe(true);
    expect(branch.head).toBeNull();
  });

  it('flags an unborn repo', () => {
    const { branch } = parseStatus(z('# branch.oid (initial)', '# branch.head main'));
    expect(branch.unborn).toBe(true);
    expect(branch.oid).toBeNull();
  });

  it('reports no upstream when the branch has none', () => {
    const { branch } = parseStatus(z('# branch.head feature'));
    expect(branch.upstream).toBeNull();
    expect(branch.ahead).toBe(0);
    expect(branch.behind).toBe(0);
  });
});

describe('parseStatus — ordinary entries', () => {
  it('splits the index and worktree axes of a partially staged file', () => {
    // XY = `MM`: staged modification AND a further unstaged modification.
    const { entries } = parseStatus(z('1 MM N... 100644 100644 100644 aaa bbb src/app.ts'));

    expect(entries).toEqual([
      {
        path: 'src/app.ts',
        origPath: null,
        staged: 'modified',
        unstaged: 'modified',
        conflicted: false,
        similarity: null,
      },
    ]);
  });

  it('reads a staged addition with a clean worktree', () => {
    const { entries } = parseStatus(z('1 A. N... 000000 100644 100644 000 bbb new.ts'));
    expect(entries[0]?.staged).toBe('added');
    expect(entries[0]?.unstaged).toBe('unmodified');
  });

  it('keeps spaces in a path', () => {
    const { entries } = parseStatus(z('1 .M N... 100644 100644 100644 aaa bbb my docs/a b.md'));
    expect(entries[0]?.path).toBe('my docs/a b.md');
  });

  it('reads an unstaged deletion', () => {
    const { entries } = parseStatus(z('1 .D N... 100644 100644 000000 aaa bbb gone.ts'));
    expect(entries[0]?.unstaged).toBe('deleted');
  });
});

describe('parseStatus — renames', () => {
  it('consumes the extra NUL token as the original path', () => {
    // A `2` record spends TWO NUL tokens: `<record>\0<origPath>\0`.
    const payload =
      '2 R. N... 100644 100644 100644 aaa bbb R100 lib/new-name.ts\x00lib/old-name.ts\x00';
    const { entries } = parseStatus(payload);

    expect(entries).toEqual([
      {
        path: 'lib/new-name.ts',
        origPath: 'lib/old-name.ts',
        staged: 'renamed',
        unstaged: 'unmodified',
        conflicted: false,
        similarity: 100,
      },
    ]);
  });

  it('does not let the origPath token leak in as its own entry', () => {
    const payload =
      '2 R. N... 100644 100644 100644 aaa bbb R087 b.ts\x00a.ts\x00' +
      '1 .M N... 100644 100644 100644 aaa bbb c.ts\x00';
    const { entries } = parseStatus(payload);

    expect(entries.map((e) => e.path)).toEqual(['b.ts', 'c.ts']);
    expect(entries[0]?.similarity).toBe(87);
  });
});

describe('parseStatus — conflicts', () => {
  it('flags an unmerged entry on both axes', () => {
    const { entries } = parseStatus(
      z('u UU N... 100644 100644 100644 100644 aaa bbb ccc src/conflict.ts'),
    );

    expect(entries[0]).toMatchObject({
      path: 'src/conflict.ts',
      conflicted: true,
      staged: 'conflicted',
      unstaged: 'conflicted',
    });
  });

  it('handles a both-added conflict', () => {
    const { entries } = parseStatus(
      z('u AA N... 000000 100644 100644 100644 000 bbb ccc both.ts'),
    );
    expect(entries[0]?.conflicted).toBe(true);
  });
});

describe('parseStatus — untracked and ignored', () => {
  it('reads untracked and ignored entries', () => {
    const { entries } = parseStatus(z('? scratch.txt', '! dist/bundle.js'));
    expect(entries[0]).toMatchObject({ path: 'scratch.txt', unstaged: 'untracked' });
    expect(entries[1]).toMatchObject({ path: 'dist/bundle.js', unstaged: 'ignored' });
  });
});

describe('parseStatus — clean tree', () => {
  it('returns no entries', () => {
    const { entries } = parseStatus(z('# branch.head main'));
    expect(entries).toEqual([]);
  });
});
