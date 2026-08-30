import type { FileDiff, StatusCode, StatusEntry } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { differsFromHead, headToWorktreeImage, imageDiffSources } from './image-sources';

const diff = (over: Partial<FileDiff> = {}): FileDiff => ({
  path: 'docs/shot.png',
  oldPath: null,
  change: 'modified',
  binary: true,
  oldMode: null,
  newMode: null,
  hunks: [],
  insertions: 0,
  deletions: 0,
  contextLines: 3,
  combined: false,
  truncated: false,
  droppedLines: 0,
  ...over,
});

const worktree = { kind: 'worktree', repoId: 'r1', staged: false } as const;

describe('imageDiffSources — when a viewer is the right answer', () => {
  it('declines a textual diff, however image-like the name', () => {
    expect(imageDiffSources(diff({ binary: false, path: 'logo.svg' }), worktree)).toBeNull();
  });

  it('declines a binary file that is not an image', () => {
    expect(imageDiffSources(diff({ path: 'app.zip' }), worktree)).toBeNull();
  });

  it('declines a diff that has not arrived yet', () => {
    expect(imageDiffSources(undefined, worktree)).toBeNull();
  });

  it('accepts a binary image', () => {
    expect(imageDiffSources(diff(), worktree)).not.toBeNull();
  });
});

describe('imageDiffSources — the revision pairing', () => {
  it('diffs the index against the checkout when unstaged', () => {
    const sources = imageDiffSources(diff(), worktree);
    // The index side comes out of the object database; the working-tree side is
    // the file on disk, which needs no `rev` at all.
    expect(sources?.before?.url).toBe('mstudio-file://repo/r1/docs/shot.png?rev=%3A');
    expect(sources?.after?.url).toBe('mstudio-file://repo/r1/docs/shot.png');
    expect([sources?.before?.label, sources?.after?.label]).toEqual(['index', 'working tree']);
  });

  it('diffs HEAD against the index when staged', () => {
    const sources = imageDiffSources(diff(), { ...worktree, staged: true });
    expect(sources?.before?.url).toBe('mstudio-file://repo/r1/docs/shot.png?rev=HEAD');
    expect(sources?.after?.url).toBe('mstudio-file://repo/r1/docs/shot.png?rev=%3A');
  });

  it('carries the worktree through, so a linked checkout is not paired with main', () => {
    const sources = imageDiffSources(diff(), { ...worktree, worktreePath: '/wt/feature' });
    expect(sources?.before?.url).toContain('?wt=%2Fwt%2Ffeature&rev=');
    expect(sources?.after?.url).toBe('mstudio-file://repo/r1/docs/shot.png?wt=%2Fwt%2Ffeature');
  });

  it('diffs a commit against its first parent', () => {
    const sources = imageDiffSources(diff(), { kind: 'commit', repoId: 'r1', sha: 'abcdef1234' });
    expect(sources?.before?.url).toBe('mstudio-file://repo/r1/docs/shot.png?rev=abcdef1234%5E');
    expect(sources?.after?.url).toBe('mstudio-file://repo/r1/docs/shot.png?rev=abcdef1234');
    expect([sources?.before?.label, sources?.after?.label]).toEqual(['abcdef1^', 'abcdef1']);
  });

  it('reads the pre-image from the OLD path on a rename', () => {
    const sources = imageDiffSources(
      diff({ change: 'renamed', oldPath: 'docs/old-shot.png' }),
      { kind: 'commit', repoId: 'r1', sha: 'abcdef1234' },
    );
    expect(sources?.before?.url).toContain('/docs/old-shot.png?rev=');
    expect(sources?.after?.url).toContain('/docs/shot.png?rev=');
  });
});

describe('imageDiffSources — one-sided changes', () => {
  it('gives an addition no before', () => {
    const sources = imageDiffSources(diff({ change: 'added' }), worktree);
    expect(sources?.before).toBeNull();
    expect(sources?.after).not.toBeNull();
  });

  it('gives a deletion no after', () => {
    const sources = imageDiffSources(diff({ change: 'deleted' }), worktree);
    expect(sources?.after).toBeNull();
    expect(sources?.before).not.toBeNull();
  });
});

describe('headToWorktreeImage — the Files view pairing', () => {
  it('reads before from HEAD and after off disk', () => {
    const sources = headToWorktreeImage({ repoId: 'r1' }, 'docs/shot.png');
    expect(sources.before?.url).toBe('mstudio-file://repo/r1/docs/shot.png?rev=HEAD');
    expect(sources.after?.url).toBe('mstudio-file://repo/r1/docs/shot.png');
  });

  it('carries the worktree, so a linked checkout compares against its own HEAD', () => {
    const sources = headToWorktreeImage({ repoId: 'r1', worktreePath: '/wt/f' }, 'a.png');
    expect(sources.before?.url).toBe('mstudio-file://repo/r1/a.png?wt=%2Fwt%2Ff&rev=HEAD');
    expect(sources.after?.url).toBe('mstudio-file://repo/r1/a.png?wt=%2Fwt%2Ff');
  });
});

describe('differsFromHead — whether a comparison is worth offering', () => {
  const entry = (staged: StatusCode, unstaged: StatusCode): StatusEntry => ({
    path: 'a.png',
    origPath: null,
    staged,
    unstaged,
    conflicted: false,
    similarity: null,
  });

  it('says no for a path status never mentions — it matches HEAD', () => {
    expect(differsFromHead(undefined)).toBe(false);
  });

  it.each([
    ['edited in the worktree', entry('unmodified', 'modified')],
    ['staged', entry('modified', 'unmodified')],
    ['staged and edited again', entry('modified', 'modified')],
    ['renamed', entry('renamed', 'unmodified')],
  ])('says yes when %s', (_name, value) => {
    expect(differsFromHead(value)).toBe(true);
  });

  it.each([
    ['untracked', entry('untracked', 'untracked')],
    ['ignored', entry('ignored', 'ignored')],
    ['staged as a new file', entry('added', 'unmodified')],
  ])('says no when %s — HEAD holds no pre-image', (_name, value) => {
    expect(differsFromHead(value)).toBe(false);
  });
});
