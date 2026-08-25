import type { Ref, StatusEntry, StatusResult } from '@midnite/git-shared';
import { describe, expect, it } from 'vitest';

import { branchHealth, worktreeHealth } from './branch-health';

const status = (partial: Partial<StatusResult> = {}): StatusResult => ({
  branch: {
    head: 'main',
    oid: 'deadbeef',
    upstream: 'origin/main',
    ahead: 0,
    behind: 0,
    unborn: false,
    detached: false,
  },
  entries: [],
  inProgress: null,
  ...partial,
});

const entry = (partial: Partial<StatusEntry> = {}): StatusEntry => ({
  path: 'src/a.ts',
  origPath: null,
  staged: 'unmodified',
  unstaged: 'modified',
  conflicted: false,
  similarity: null,
  ...partial,
});

const ref = (partial: Partial<Ref> = {}): Ref => ({
  name: 'main',
  fullName: 'refs/heads/main',
  kind: 'localBranch',
  sha: 'deadbeef',
  upstream: null,
  isHead: false,
  worktreePath: null,
  ...partial,
});

describe('worktreeHealth', () => {
  it('reports a clean tree as unknown, not green', () => {
    // Green has to mean something. "You have not edited anything" is not a
    // verdict on the code, and a sidebar of green dots would drown a real one.
    expect(worktreeHealth(status())).toEqual({ level: 'unknown', reason: 'Working tree clean' });
  });

  it('warns about uncommitted changes, counting paths once', () => {
    // A path staged and then edited again is two states of one file, not two
    // files — porcelain-v2 tracks both axes on the same entry.
    const health = worktreeHealth(
      status({ entries: [entry({ staged: 'modified', unstaged: 'modified' })] }),
    );
    expect(health).toEqual({ level: 'warn', reason: '1 uncommitted change' });
  });

  it('fails on a conflict', () => {
    const health = worktreeHealth(
      status({ entries: [entry({ conflicted: true }), entry({ path: 'b.ts', conflicted: true })] }),
    );
    expect(health).toEqual({ level: 'fail', reason: '2 conflicted files' });
  });

  it('lets a paused operation outrank the file counts', () => {
    // Mid-rebase the thing to say is "rebase in progress" — the conflicted file
    // list is a symptom of it, not the headline.
    const health = worktreeHealth(
      status({ inProgress: 'rebase', entries: [entry({ conflicted: true })] }),
    );
    expect(health).toEqual({ level: 'fail', reason: 'rebase in progress' });
  });

  it('says nothing at all when there is no status yet', () => {
    expect(worktreeHealth(undefined)).toEqual({ level: 'unknown', reason: '' });
  });
});

describe('branchHealth', () => {
  it('attributes working-tree state only to the branch that is checked out here', () => {
    const dirty = status({ entries: [entry()] });
    expect(branchHealth({ ref: ref({ isHead: true }), status: dirty }).level).toBe('warn');
    // Same status object, a branch that is NOT head: the dirt belongs to the
    // other checkout, and claiming it here would point at the wrong row.
    expect(branchHealth({ ref: ref({ name: 'feature' }), status: dirty }).level).toBe('unknown');
  });

  it('warns when the upstream is gone, checked out or not', () => {
    const gone = ref({ upstream: { name: 'origin/main', ahead: 0, behind: 0, gone: true } });
    expect(branchHealth({ ref: gone })).toEqual({
      level: 'warn',
      reason: 'Upstream branch is gone',
    });
  });

  it('takes a checks verdict when one is supplied', () => {
    const health = branchHealth({
      ref: ref(),
      checks: { level: 'ok', summary: '3 of 3 checks passed' },
    });
    expect(health).toEqual({ level: 'ok', reason: '3 of 3 checks passed' });
  });

  it('lets the worst signal win, whichever source it came from', () => {
    const health = branchHealth({
      ref: ref({ isHead: true }),
      status: status({ inProgress: 'merge' }),
      checks: { level: 'ok', summary: '3 of 3 checks passed' },
    });
    expect(health).toEqual({ level: 'fail', reason: 'merge in progress' });

    const failing = branchHealth({
      ref: ref({ isHead: true }),
      status: status({ entries: [entry()] }),
      checks: { level: 'fail', summary: 'build failed' },
    });
    expect(failing).toEqual({ level: 'fail', reason: 'build failed' });
  });

  it('reports unknown for an ordinary branch nobody has anything to say about', () => {
    // The common case, and the reason `unknown` renders as no dot rather than a
    // fourth colour.
    expect(branchHealth({ ref: ref() }).level).toBe('unknown');
  });
});
