import type { Ref, RepoDescriptor } from '@midnite/git-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import type { WorktreeStatuses } from '../../services/use-status';
import { branchesCount, matchesRepoQuery, partitionRefs, RepoTree } from './repos-panel';
import { ALL_SECTIONS, type SectionKey, type ViewSections } from './view-sections';

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

describe('branchesCount', () => {
  it('sums local branches and remote groups, not every remote-tracking ref', () => {
    const { branches, remotes } = partitionRefs([
      ref({ name: 'main', kind: 'localBranch' }),
      ref({ name: 'feat', kind: 'localBranch' }),
      ref({ name: 'origin/main', kind: 'remoteBranch' }),
      ref({ name: 'origin/feat', kind: 'remoteBranch' }),
      ref({ name: 'upstream/main', kind: 'remoteBranch' }),
    ]);

    // 2 local branches + 2 remote GROUPS (origin, upstream) — not 2 + 3 refs.
    expect(branchesCount(branches, remotes)).toBe(4);
  });

  it('is zero for a repo with no branches and no remotes', () => {
    expect(branchesCount([], [])).toBe(0);
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

describe('RepoTree', () => {
  // No global RTL setup file cleans the DOM between tests, and the panel's
  // sections attach directly to `document.body` — without this, the second
  // test's query would also see the first render's leftover headings.
  afterEach(cleanup);

  const repo: RepoDescriptor = {
    id: 'repo-1',
    path: '/tmp/repo',
    name: 'repo',
    headRef: 'main',
    worktrees: [
      {
        id: 'repo-1:/tmp/repo',
        repoId: 'repo-1',
        path: '/tmp/repo',
        branch: 'main',
        headSha: 'deadbeef',
        locked: false,
        isMain: true,
        prunable: false,
      },
    ],
  };

  const refs: Ref[] = [
    ref({ name: 'main', kind: 'localBranch', isHead: true }),
    ref({ name: 'origin/main', kind: 'remoteBranch' }),
    ref({ name: 'v1.0.0', kind: 'tag' }),
  ];

  const statuses: WorktreeStatuses = { byPath: new Map(), total: 0, isLoading: false };

  const unfiltered: ViewSections = {
    visible: (key: SectionKey) => ALL_SECTIONS.includes(key),
    dirtyOnly: false,
    filtered: false,
    toggle: () => {},
  };

  function renderTree(sections: ViewSections) {
    const client = new QueryClient();
    return render(
      <QueryClientProvider client={client}>
        <DialogHost>
          <RepoTree
            repo={repo}
            refs={refs}
            remotes={[]}
            statuses={statuses}
            sections={sections}
            refMenu={() => []}
            worktreeMenu={() => []}
            sectionMenu={() => []}
            parentSectionMenu={() => []}
            onViewAllChanges={() => {}}
            onCheckout={() => {}}
          />
        </DialogHost>
      </QueryClientProvider>,
    );
  }

  /**
   * The regression Theme C exists to make impossible: four hand-written
   * `<TreeSection>` blocks used to render in whatever order they happened to
   * sit in the source, agreeing with `ALL_SECTIONS` by coincidence rather than
   * by construction. This renders the real component and reads the actual
   * heading order back out of the DOM, so it fails the moment anyone reverts
   * to a literal block `SECTION_TREE` does not know about.
   */
  it('renders section headings in the order the visible flattened tree gives, Worktrees first', () => {
    renderTree(unfiltered);

    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

    // 'origin' is RemoteGroup's own heading, nested inside Remotes. Forge/
    // Actions/Reviews/Issues are absent (no GitHub remote); Tests always
    // mounts (TestsSection has no remote gate) and sits where 'forge' does in
    // SECTION_TREE, since Theme F — not this slice — is what gives Forge its
    // own nested heading.
    expect(headings).toEqual([
      'Worktrees',
      'Branches',
      'Local',
      'Remotes',
      'origin',
      'Tags',
      'Tests',
    ]);
  });

  it('gives the Branches heading a combined local+remote-group count', () => {
    renderTree(unfiltered);

    // The fixture has 1 local branch ('main') and 1 remote group ('origin') —
    // 2, not 1 (local) + 1 (the single 'origin/main' ref it groups).
    const heading = screen.getByRole('heading', { level: 3, name: 'Branches' });
    expect(heading.parentElement?.textContent).toBe('Branches2');
  });

  it('hides Branches entirely when every child section is filtered away', () => {
    const worktreesOnly: ViewSections = {
      visible: (key: SectionKey) => key === 'worktrees',
      // Not the dirty-checkout filter's own behaviour under test here — just
      // section visibility, so the fixture's clean worktree still renders.
      dirtyOnly: false,
      filtered: true,
      toggle: () => {},
    };
    renderTree(worktreesOnly);

    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['Worktrees']);
  });
});
