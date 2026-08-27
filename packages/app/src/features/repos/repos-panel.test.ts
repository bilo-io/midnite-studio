import type { Ref } from '@midnite/git-shared';
import { describe, expect, it } from 'vitest';

import { matchesRepoQuery, partitionRefs } from './repos-panel';

const ref = (partial: Partial<Ref> & Pick<Ref, 'name' | 'kind'>): Ref => ({
  fullName: `refs/${partial.kind === 'tag' ? 'tags' : 'heads'}/${partial.name}`,
  sha: 'deadbeef',
  upstream: null,
  isHead: false,
  worktreePath: null,
  ...partial,
});

describe('partitionRefs', () => {
  it('splits refs into branches, grouped remotes and tags', () => {
    const { branches, remotes, tags } = partitionRefs([
      ref({ name: 'main', kind: 'localBranch' }),
      ref({ name: 'origin/main', kind: 'remoteBranch' }),
      ref({ name: 'upstream/main', kind: 'remoteBranch' }),
      ref({ name: 'v1.0.0', kind: 'tag' }),
    ]);

    expect(branches.map((r) => r.name)).toEqual(['main']);
    expect(tags.map((r) => r.name)).toEqual(['v1.0.0']);
    expect(remotes.map((g) => g.name)).toEqual(['origin', 'upstream']);
  });

  it('groups a remote by the segment before the first slash, not the last', () => {
    // `origin/feat/x` belongs to `origin`, not to `origin/feat`.
    const { remotes } = partitionRefs([
      ref({ name: 'origin/feat/x', kind: 'remoteBranch' }),
      ref({ name: 'origin/main', kind: 'remoteBranch' }),
    ]);

    expect(remotes).toHaveLength(1);
    expect(remotes[0]?.name).toBe('origin');
    expect(remotes[0]?.refs).toHaveLength(2);
  });

  it('keeps a slashless remote ref rather than dropping it', () => {
    const { remotes } = partitionRefs([ref({ name: 'weird', kind: 'remoteBranch' })]);
    expect(remotes).toEqual([expect.objectContaining({ name: 'weird' })]);
  });

  it('sorts HEAD to the top of the branches', () => {
    // The branch you are on is the one you look for; it must not drift down the
    // list as branches are added above it alphabetically.
    const { branches } = partitionRefs([
      ref({ name: 'alpha', kind: 'localBranch' }),
      ref({ name: 'zulu', kind: 'localBranch', isHead: true }),
      ref({ name: 'beta', kind: 'localBranch' }),
    ]);

    expect(branches.map((r) => r.name)).toEqual(['zulu', 'alpha', 'beta']);
  });

  it('sorts tags newest-looking first, numerically', () => {
    const { tags } = partitionRefs([
      ref({ name: 'v1.2.0', kind: 'tag' }),
      ref({ name: 'v1.10.0', kind: 'tag' }),
      ref({ name: 'v1.9.0', kind: 'tag' }),
    ]);

    // Lexicographically v1.9.0 > v1.10.0; numerically it does not.
    expect(tags.map((r) => r.name)).toEqual(['v1.10.0', 'v1.9.0', 'v1.2.0']);
  });

  it('returns empty sections for a repo with no refs', () => {
    expect(partitionRefs([])).toEqual({ branches: [], remotes: [], tags: [] });
  });
});

describe('matchesRepoQuery', () => {
  const repo = { name: 'midnite-git', path: '/Users/x/Dev/midnite-git' };

  it('keeps everything for an empty or whitespace-only query', () => {
    // The box starts empty and stays empty most of the time; a filter that
    // hides the list until something is typed is not a filter.
    expect(matchesRepoQuery(repo, '')).toBe(true);
    expect(matchesRepoQuery(repo, '   ')).toBe(true);
  });

  it('matches the name case-insensitively on a partial', () => {
    expect(matchesRepoQuery(repo, 'MIDN')).toBe(true);
    expect(matchesRepoQuery(repo, 'nite-g')).toBe(true);
  });

  it('matches on the path, not just the name', () => {
    // Two checkouts of one project share a name and differ only in where they
    // live, so the path has to be searchable or they cannot be told apart.
    expect(matchesRepoQuery(repo, 'dev')).toBe(true);
    expect(matchesRepoQuery({ name: 'api', path: '/srv/legacy/api' }, 'legacy')).toBe(true);
  });

  it('requires every whitespace-separated term to match, in any order', () => {
    expect(matchesRepoQuery(repo, 'git dev')).toBe(true);
    expect(matchesRepoQuery(repo, 'dev git')).toBe(true);
    expect(matchesRepoQuery(repo, 'dev nope')).toBe(false);
  });

  it('rejects a repo that matches nothing typed', () => {
    expect(matchesRepoQuery(repo, 'zzz')).toBe(false);
  });
});
