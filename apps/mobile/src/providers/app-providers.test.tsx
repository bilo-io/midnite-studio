// vitest/jsdom: provider tree, the AuthGate and the query hooks over a fake data source (Phase 146 B8, E6).
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { Text } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '../../test/mocks/expo-secure-store';
import { SESSION_ENDED_NOTICE } from '../auth/auth-context';
import { useHistory, useProjectFields, useProjectGraph, useProjectItems, useSetItemField } from '../data/queries';
import { ok, fail, type MobileDataSource } from '../data/source';
import { AppProviders } from './app-providers';

const repo = { owner: 'o', name: 'r' };
const fake = (over: Record<string, unknown>) => over as unknown as MobileDataSource;
const commit = (sha: string) => ({ sha });

afterEach(cleanup);

beforeEach(() => {
  store.clear();
  store.set('midnite:active-login', 'octo');
  store.set('github:github.com:octo', 'ghp_FAKE');
});

describe('AppProviders and AuthGate', () => {
  it('renders children through the theme, auth, query and data providers once a session exists', async () => {
    render(
      <AppProviders source={fake({})}>
        <Text>hello</Text>
      </AppProviders>,
    );
    expect(await screen.findByText('hello')).toBeTruthy();
  });

  it('shows the sign-in screen, with the PAT link, until a token exists', async () => {
    store.clear();
    render(
      <AppProviders source={fake({})}>
        <Text>hello</Text>
      </AppProviders>,
    );
    expect(await screen.findByText('Use a personal access token')).toBeTruthy();
    expect(screen.queryByText('hello')).toBeNull();
  });

  it('an auth result from any call clears the token and returns to sign-in with the notice', async () => {
    const history = vi.fn(async () => fail('auth', 'rejected'));
    function Probe() {
      useHistory(repo, 'main');
      return <Text>signed in</Text>;
    }
    render(
      <AppProviders source={fake({ history })}>
        <Probe />
      </AppProviders>,
    );
    expect(await screen.findByText(SESSION_ENDED_NOTICE)).toBeTruthy();
    expect(store.size).toBe(0);
  });
});

describe('query hooks', () => {
  it('list hooks page on the cursor', async () => {
    const history = vi.fn(async (_r, _ref, cursor) =>
      cursor === null ? ok({ items: [commit('a')], nextCursor: 'c1' }) : ok({ items: [commit('b')], nextCursor: null }),
    );
    let fetchNext: () => unknown = () => {};
    let seen: string[] = [];
    function Probe() {
      const q = useHistory(repo, 'main');
      fetchNext = q.fetchNextPage;
      seen = (q.data?.pages ?? []).flatMap((p) => p.items.map((c) => c.sha));
      return <Text>{seen.join(',')}</Text>;
    }
    render(
      <AppProviders source={fake({ history })}>
        <Probe />
      </AppProviders>,
    );
    await screen.findByText('a');
    await act(async () => {
      await fetchNext();
    });
    await waitFor(() => expect(seen).toEqual(['a', 'b']));
    expect(history).toHaveBeenLastCalledWith(repo, 'main', 'c1');
  });

  it('setItemField invalidates projectItems and projectGraph only', async () => {
    const projectItems = vi.fn(async () => ok({ items: [], nextCursor: null }));
    const projectGraph = vi.fn(async () => ok({}));
    const projectFields = vi.fn(async () => ok([]));
    const setItemField = vi.fn(async () => ok(null));
    let write: ((v: { projectId: string; itemId: string; fieldId: string; optionId: string }) => Promise<unknown>) | null = null;
    function Probe() {
      useProjectItems('P');
      useProjectGraph('P');
      useProjectFields('P');
      write = useSetItemField().mutateAsync;
      return <Text>ready</Text>;
    }
    render(
      <AppProviders source={fake({ projectItems, projectGraph, projectFields, setItemField })}>
        <Probe />
      </AppProviders>,
    );
    await screen.findByText('ready');
    await waitFor(() => expect(projectItems).toHaveBeenCalledTimes(1));
    await act(async () => {
      await write!({ projectId: 'P', itemId: 'I', fieldId: 'F', optionId: 'O' });
    });
    await waitFor(() => {
      expect(projectItems).toHaveBeenCalledTimes(2);
      expect(projectGraph).toHaveBeenCalledTimes(2);
    });
    expect(projectFields).toHaveBeenCalledTimes(1);
  });
});
