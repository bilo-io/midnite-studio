import type { Ref } from '@midnite/git-shared';
import { describe, expect, it } from 'vitest';

import { partitionRefs } from './repos-panel';

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
