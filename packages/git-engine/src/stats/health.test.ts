import { describe, expect, it } from 'vitest';

import { mergedNames, parseCountObjects, parseRefRows } from './health';

const F = '\x00';

describe('parseRefRows', () => {
  it('reads a committer date and a ref name', () => {
    expect(parseRefRows(`1700000000${F}refs/heads/main\n`)).toEqual([
      { at: 1_700_000_000, refName: 'refs/heads/main' },
    ]);
  });

  it('keeps a branch name containing a slash and a space intact', () => {
    // Branch names are far more permissive than people expect; splitting on
    // whitespace here is the classic way this parser breaks.
    const rows = parseRefRows(`1700000000${F}refs/heads/feat/my branch\n`);
    expect(rows[0]!.refName).toBe('refs/heads/feat/my branch');
  });

  it('drops a row it cannot understand rather than the whole list', () => {
    const rows = parseRefRows(`garbage\n1700000000${F}refs/heads/main\n\n`);
    expect(rows).toHaveLength(1);
  });

  it('is empty for a repository with no refs', () => {
    expect(parseRefRows('')).toEqual([]);
  });
});

describe('parseCountObjects', () => {
  /** Captured `git count-objects -vH` from a real repository. */
  const OUTPUT = `count: 142
size: 1.42 MiB
in-pack: 28371
packs: 2
size-pack: 41.83 MiB
prune-packable: 0
garbage: 0
size-garbage: 0 bytes
`;

  it('sums the loose and packed sizes', () => {
    // A repository that has never been gc'd carries most of its bytes loose,
    // so reporting only size-pack would under-report exactly the repos worth
    // warning about.
    const { sizeBytes } = parseCountObjects(OUTPUT);
    const expected = Math.round(41.83 * 1024 ** 2 + 1.42 * 1024 ** 2);
    expect(sizeBytes).toBe(expected);
  });

  it('reads the loose object count', () => {
    expect(parseCountObjects(OUTPUT).loose).toBe(142);
  });

  it('handles a fresh repository with nothing packed', () => {
    const { sizeBytes, loose } = parseCountObjects('count: 0\nsize: 0 bytes\nsize-pack: 0 bytes\n');
    // Zero total reports null, not 0 — there is nothing to say about the size
    // of an empty object store, and a "0 B" badge would just be noise.
    expect(sizeBytes).toBeNull();
    expect(loose).toBe(0);
  });

  it('is null rather than NaN when the output is unrecognisable', () => {
    expect(parseCountObjects('git: command not found')).toEqual({ sizeBytes: null, loose: null });
  });

  it('understands GiB as well as MiB', () => {
    expect(parseCountObjects('size: 0 bytes\nsize-pack: 2.5 GiB\n').sizeBytes).toBe(
      Math.round(2.5 * 1024 ** 3),
    );
  });
});

describe('mergedNames', () => {
  it('collects the branch names, trimmed', () => {
    expect(mergedNames('  feat/a\nfeat/b\n\n')).toEqual(new Set(['feat/a', 'feat/b']));
  });

  it('is empty for no output', () => {
    expect(mergedNames('')).toEqual(new Set());
  });
});
