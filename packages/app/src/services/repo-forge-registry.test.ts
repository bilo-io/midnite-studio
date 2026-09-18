import { createElement } from 'react';

import { cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { MidniteStudioBridge, RepoDescriptor, Remote } from '@midnite/studio-shared';

import { keys } from './queries';
import {
  forgeRegistryKey,
  lookupRepoIdByForge,
  useRepoForgeRegistry,
  useSyncRepoForgeRegistry,
} from './repo-forge-registry';

beforeEach(() => {
  useRepoForgeRegistry.setState({ byForgeKey: {} });
  delete (window as unknown as { midniteStudio?: MidniteStudioBridge }).midniteStudio;
});

// `renderHook` mounts a real component tree; without an explicit unmount,
// React's own deferred work can still be scheduled when the next test's
// `beforeEach` tears jsdom's `window` down, producing an unhandled
// "window is not defined" after the file has otherwise finished.
afterEach(() => {
  cleanup();
});

describe('forgeRegistryKey', () => {
  it('lower-cases every part', () => {
    expect(forgeRegistryKey('GitHub.com', 'Bilo-IO', 'Midnite-Studio')).toBe(
      'github.com/bilo-io/midnite-studio',
    );
  });
});

describe('useRepoForgeRegistry / lookupRepoIdByForge', () => {
  it('starts empty', () => {
    expect(lookupRepoIdByForge('github.com', 'bilo-io', 'midnite-studio')).toBeNull();
  });

  it('setEntries replaces the whole map, keyed by host/owner/repo', () => {
    useRepoForgeRegistry.getState().setEntries([
      { repoId: 'repo-1', forge: { host: 'github.com', owner: 'bilo-io', repo: 'a', kind: 'github' } },
      { repoId: 'repo-2', forge: { host: 'github.com', owner: 'bilo-io', repo: 'b', kind: 'github' } },
    ]);

    expect(lookupRepoIdByForge('github.com', 'bilo-io', 'a')).toBe('repo-1');
    expect(lookupRepoIdByForge('github.com', 'bilo-io', 'b')).toBe('repo-2');

    // A second call replaces, rather than merges — a repo that closed drops out.
    useRepoForgeRegistry.getState().setEntries([
      { repoId: 'repo-2', forge: { host: 'github.com', owner: 'bilo-io', repo: 'b', kind: 'github' } },
    ]);
    expect(lookupRepoIdByForge('github.com', 'bilo-io', 'a')).toBeNull();
    expect(lookupRepoIdByForge('github.com', 'bilo-io', 'b')).toBe('repo-2');
  });
});

describe('useSyncRepoForgeRegistry', () => {
  const repo = (id: string): RepoDescriptor =>
    ({ id, name: id, path: `/tmp/${id}`, worktrees: [] }) as unknown as RepoDescriptor;

  const remote = (forge: Remote['forge']): Remote => ({
    name: 'origin',
    fetchUrl: 'irrelevant',
    pushUrl: 'irrelevant',
    forge,
  });

  const mount = (client: QueryClient) =>
    renderHook(() => useSyncRepoForgeRegistry(), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });

  it('populates the registry from every registered repo’s remotes', async () => {
    const client = new QueryClient();
    client.setQueryData(keys.repos, [repo('repo-1'), repo('repo-2')]);
    client.setQueryData(keys.remotes('repo-1'), [
      remote({ host: 'github.com', owner: 'bilo-io', repo: 'one', kind: 'github' }),
    ]);
    client.setQueryData(keys.remotes('repo-2'), [
      remote({ host: 'github.com', owner: 'bilo-io', repo: 'two', kind: 'github' }),
    ]);

    mount(client);

    await Promise.resolve();

    expect(lookupRepoIdByForge('github.com', 'bilo-io', 'one')).toBe('repo-1');
    expect(lookupRepoIdByForge('github.com', 'bilo-io', 'two')).toBe('repo-2');
  });

  it('skips a repo whose remotes resolve to no forge', async () => {
    const client = new QueryClient();
    client.setQueryData(keys.repos, [repo('local-only')]);
    client.setQueryData(keys.remotes('local-only'), [remote(null)]);

    mount(client);
    await Promise.resolve();

    expect(useRepoForgeRegistry.getState().byForgeKey).toEqual({});
  });

  it('with no registered repos, leaves the registry empty', async () => {
    const client = new QueryClient();
    client.setQueryData(keys.repos, []);

    mount(client);
    await Promise.resolve();

    expect(useRepoForgeRegistry.getState().byForgeKey).toEqual({});
  });
});
