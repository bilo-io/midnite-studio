import type { Ref } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { countLocalBranches } from './branch-count';

const ref = (name: string, kind: Ref['kind']): Ref => ({
  name,
  fullName: `refs/${kind}/${name}`,
  kind,
  sha: 'deadbeef',
  upstream: null,
  isHead: false,
  worktreePath: null,
});

describe('countLocalBranches', () => {
  it('returns 0 for an empty ref list', () => {
    expect(countLocalBranches([])).toBe(0);
  });

  it('counts only local branches, excluding remote branches, tags, and head', () => {
    const refs = [
      ref('main', 'localBranch'),
      ref('feature/x', 'localBranch'),
      ref('origin/main', 'remoteBranch'),
      ref('v1.0.0', 'tag'),
      ref('HEAD', 'head'),
    ];

    expect(countLocalBranches(refs)).toBe(2);
  });
});
