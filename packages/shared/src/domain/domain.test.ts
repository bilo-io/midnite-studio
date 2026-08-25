import { describe, expect, it } from 'vitest';

import {
  GitOpResultSchema,
  RefSchema,
  StatusEntrySchema,
  WorktreeSchema,
  conflict,
  failure,
  ok,
} from './index';

/**
 * These schemas ARE the wire format — they're what every IPC handler validates
 * against. The cases below are the ones a change is most likely to break
 * silently: defaults that let a producer omit a field, and the GitOpResult
 * envelope, whose whole purpose is that a conflict crosses IPC as data.
 */
describe('GitOpResult', () => {
  it('accepts the success arm', () => {
    expect(GitOpResultSchema.parse(ok())).toEqual({ ok: true });
  });

  it('accepts a conflict, preserving the op and the file list', () => {
    const parsed = GitOpResultSchema.parse(conflict('rebase', ['a.ts', 'b.ts']));
    expect(parsed).toEqual({ ok: false, kind: 'conflict', op: 'rebase', files: ['a.ts', 'b.ts'] });
  });

  it('accepts an error with and without stderr', () => {
    expect(GitOpResultSchema.parse(failure('nope'))).toEqual({
      ok: false,
      kind: 'error',
      message: 'nope',
    });
    expect(GitOpResultSchema.parse(failure('nope', 'fatal: …'))).toMatchObject({
      stderr: 'fatal: …',
    });
  });

  it('rejects a failure with no kind', () => {
    expect(() => GitOpResultSchema.parse({ ok: false, message: 'x' })).toThrow();
  });

  it('rejects an unknown conflict op', () => {
    expect(() =>
      GitOpResultSchema.parse({ ok: false, kind: 'conflict', op: 'squash', files: [] }),
    ).toThrow();
  });

  it('narrows on ok, then on kind', () => {
    const result = GitOpResultSchema.parse(conflict('merge', ['x']));
    if (result.ok) throw new Error('expected a failure');
    // TypeScript narrows through both keys — this only compiles because of it.
    expect(result.kind === 'conflict' ? result.files : []).toEqual(['x']);
  });
});

describe('schema defaults', () => {
  it('defaults a Ref to no upstream, not HEAD, checked out nowhere', () => {
    const ref = RefSchema.parse({
      name: 'main',
      fullName: 'refs/heads/main',
      kind: 'localBranch',
      sha: 'a'.repeat(40),
    });

    expect(ref).toMatchObject({ upstream: null, isHead: false, worktreePath: null });
  });

  it('defaults a StatusEntry to a non-conflicted, non-rename change', () => {
    const entry = StatusEntrySchema.parse({
      path: 'a.ts',
      staged: 'modified',
      unstaged: 'unmodified',
    });

    expect(entry).toMatchObject({ origPath: null, conflicted: false, similarity: null });
  });

  it('defaults a Worktree to not prunable', () => {
    const worktree = WorktreeSchema.parse({
      id: 'r:/p',
      repoId: 'r',
      path: '/p',
      branch: 'main',
      headSha: 'a'.repeat(40),
      locked: false,
      isMain: true,
    });

    expect(worktree.prunable).toBe(false);
  });

  it('rejects a similarity score outside 0–100', () => {
    expect(() =>
      StatusEntrySchema.parse({
        path: 'a.ts',
        staged: 'renamed',
        unstaged: 'unmodified',
        similarity: 101,
      }),
    ).toThrow();
  });
});
