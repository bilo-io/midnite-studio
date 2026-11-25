// vitest/jsdom: unit tests for selectRepoForSessionOrChat and resolveRepoForTarget.
import type { RepoDescriptor } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { keys } from '../services/queries';
import { appQueryClient } from '../services/query-client';
import { useUiStore } from '../store/ui-store';
import { resolveRepoForTarget, selectRepoForSessionOrChat } from './select-repo-for-item';

const repo = (
  id: string,
  path: string,
  worktrees: RepoDescriptor['worktrees'] = [],
): RepoDescriptor => ({
  id,
  name: id,
  path,
  headRef: 'main',
  worktrees,
});

const REPO_OUTER = repo('repo:outer', '/Users/dev/outer');
const REPO_INNER = repo('repo:inner', '/Users/dev/outer/inner');
const REPO_SIBLING_WT = repo('repo:wt', '/Users/dev/alpha', [
  {
    id: 'wt:1',
    repoId: 'repo:wt',
    path: '/Users/dev/alpha-feat',
    branch: 'feat',
    headSha: 'abc123',
    locked: false,
    isMain: false,
    prunable: false,
  },
]);
const REPOS: readonly RepoDescriptor[] = [REPO_OUTER, REPO_INNER, REPO_SIBLING_WT];

const origSelectRepo = useUiStore.getState().selectRepo;

beforeEach(() => {
  appQueryClient.clear();
  useUiStore.setState({ selectedRepoId: null, selectRepo: origSelectRepo });
});

afterEach(() => {
  appQueryClient.clear();
  useUiStore.setState({ selectedRepoId: null, selectRepo: origSelectRepo });
});

describe('resolveRepoForTarget', () => {
  it('matches cwd exactly and strips trailing slashes', () => {
    expect(resolveRepoForTarget({ cwd: '/Users/dev/outer/' }, REPOS)?.id).toBe('repo:outer');
  });

  it('picks the longest matching repo.path when paths are nested', () => {
    expect(
      resolveRepoForTarget(
        { repoId: 'repo:outer', cwd: '/Users/dev/outer/inner/packages/app' },
        REPOS,
      )?.id,
    ).toBe('repo:inner');
  });

  it('matches a registered sibling worktree path', () => {
    expect(
      resolveRepoForTarget({ cwd: '/Users/dev/alpha-feat/src' }, REPOS)?.id,
    ).toBe('repo:wt');
  });

  it('enforces path-boundary matching so /outer-old does not match /outer', () => {
    expect(resolveRepoForTarget({ cwd: '/Users/dev/outer-old' }, REPOS)).toBeNull();
  });

  it('falls back to repoId when cwd is absent or does not match any registered repo', () => {
    expect(resolveRepoForTarget({ repoId: 'repo:outer' }, REPOS)?.id).toBe('repo:outer');
    expect(
      resolveRepoForTarget({ repoId: 'repo:inner', cwd: '/Users/dev/unregistered' }, REPOS)?.id,
    ).toBe('repo:inner');
  });

  it('returns null for unknown or synthetic repoIds when cwd does not match', () => {
    expect(
      resolveRepoForTarget({ repoId: '__workflow__', cwd: '/tmp/work' }, REPOS),
    ).toBeNull();
    expect(resolveRepoForTarget({ repoId: 'repo:missing' }, REPOS)).toBeNull();
  });
});

describe('selectRepoForSessionOrChat', () => {
  it('reads repos from appQueryClient keys.repos cache and calls selectRepo', () => {
    appQueryClient.setQueryData(keys.repos, REPOS);
    const selectSpy = vi.fn(origSelectRepo);
    useUiStore.setState({ selectRepo: selectSpy });

    selectRepoForSessionOrChat({ repoId: 'repo:outer', cwd: '/Users/dev/outer/inner/src' });

    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(selectSpy).toHaveBeenCalledWith('repo:inner');
    expect(useUiStore.getState().selectedRepoId).toBe('repo:inner');
  });

  it('is a no-op when the matched repo is already selected', () => {
    appQueryClient.setQueryData(keys.repos, REPOS);
    const selectSpy = vi.fn(origSelectRepo);
    useUiStore.setState({ selectedRepoId: 'repo:inner', selectRepo: selectSpy });

    selectRepoForSessionOrChat({ cwd: '/Users/dev/outer/inner' });

    expect(selectSpy).not.toHaveBeenCalled();
  });

  it('is a no-op when no registered repo matches', () => {
    appQueryClient.setQueryData(keys.repos, REPOS);
    const selectSpy = vi.fn(origSelectRepo);
    useUiStore.setState({ selectedRepoId: 'repo:outer', selectRepo: selectSpy });

    selectRepoForSessionOrChat({ repoId: '__workflow__', cwd: '/tmp/scratch' });

    expect(selectSpy).not.toHaveBeenCalled();
    expect(useUiStore.getState().selectedRepoId).toBe('repo:outer');
  });
});
