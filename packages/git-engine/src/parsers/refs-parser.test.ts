import { describe, expect, it } from 'vitest';

import { parseRefs, parseTrack } from './refs-parser';

/** Build a for-each-ref record in FOR_EACH_REF_FORMAT's field order. */
const row = (f: {
  refname: string;
  objecttype?: string;
  objectname?: string;
  peeled?: string;
  upstream?: string;
  track?: string;
  head?: string;
  worktree?: string;
}) =>
  [
    f.refname,
    f.objecttype ?? 'commit',
    f.objectname ?? '1'.repeat(40),
    f.peeled ?? '',
    f.upstream ?? '',
    f.track ?? '',
    f.head ?? ' ',
    f.worktree ?? '',
  ].join('\x00');

describe('parseRefs', () => {
  it('classifies branches, remote branches and tags, and shortens their names', () => {
    const refs = parseRefs(
      [
        row({ refname: 'refs/heads/main', head: '*' }),
        row({ refname: 'refs/remotes/origin/main' }),
        row({ refname: 'refs/tags/v1.0.0' }),
      ].join('\n'),
    );

    expect(refs.map((r) => [r.kind, r.name])).toEqual([
      ['localBranch', 'main'],
      ['remoteBranch', 'origin/main'],
      ['tag', 'v1.0.0'],
    ]);
    expect(refs[0]?.isHead).toBe(true);
    expect(refs[1]?.isHead).toBe(false);
  });

  it('peels an annotated tag to its commit', () => {
    // The graph joins badges to rows by COMMIT sha; an annotated tag's own
    // objectname is the tag object and matches no row.
    const tagObject = '9'.repeat(40);
    const commit = '2'.repeat(40);
    const [ref] = parseRefs(
      row({
        refname: 'refs/tags/v2.0.0',
        objecttype: 'tag',
        objectname: tagObject,
        peeled: commit,
      }),
    );

    expect(ref?.sha).toBe(commit);
  });

  it('leaves a lightweight tag alone', () => {
    const commit = '3'.repeat(40);
    const [ref] = parseRefs(row({ refname: 'refs/tags/light', objectname: commit }));
    expect(ref?.sha).toBe(commit);
  });

  it('drops refs/remotes/origin/HEAD', () => {
    // It is a symbolic pointer at the remote default branch — badging it would
    // double-label whichever branch it points at.
    const refs = parseRefs(
      [
        row({ refname: 'refs/remotes/origin/HEAD' }),
        row({ refname: 'refs/remotes/origin/main' }),
      ].join('\n'),
    );

    expect(refs.map((r) => r.name)).toEqual(['origin/main']);
  });

  it('ignores refs outside heads/remotes/tags (notes, stash, pull refs)', () => {
    const refs = parseRefs(
      [row({ refname: 'refs/notes/commits' }), row({ refname: 'refs/stash' })].join('\n'),
    );
    expect(refs).toEqual([]);
  });

  it('records the worktree a branch is checked out in', () => {
    const [ref] = parseRefs(
      row({ refname: 'refs/heads/feature', worktree: '/Users/x/wt/feature' }),
    );
    expect(ref?.worktreePath).toBe('/Users/x/wt/feature');
  });

  it('leaves worktreePath null for a branch checked out nowhere', () => {
    const [ref] = parseRefs(row({ refname: 'refs/heads/idle' }));
    expect(ref?.worktreePath).toBeNull();
  });
});

describe('parseTrack', () => {
  it('returns null when there is no upstream', () => {
    expect(parseTrack('', '')).toBeNull();
  });

  it('reads an in-sync upstream as 0/0', () => {
    expect(parseTrack('origin/main', '')).toEqual({
      name: 'origin/main',
      ahead: 0,
      behind: 0,
      gone: false,
    });
  });

  it('reads ahead-only, behind-only and diverged', () => {
    expect(parseTrack('origin/a', '[ahead 3]')).toMatchObject({ ahead: 3, behind: 0 });
    expect(parseTrack('origin/b', '[behind 2]')).toMatchObject({ ahead: 0, behind: 2 });
    expect(parseTrack('origin/c', '[ahead 3, behind 2]')).toMatchObject({ ahead: 3, behind: 2 });
  });

  it('flags a deleted upstream', () => {
    expect(parseTrack('origin/dead', '[gone]')).toMatchObject({ gone: true });
  });
});
