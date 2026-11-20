// vitest/jsdom: the shell's pieces over the real provider tree and a fake data source (Phase 146 Theme F). jsdom is
// enough: nothing here needs real layout or pointer drag.
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { Keyboard, PixelRatio, Pressable, Text } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routerCalls, setSegments } from '../../test/mocks/expo-router';
import { Openers, renderInShell, resetShellState } from '../../test/shell-harness';
import { ok } from '../data/source';
import { usePrefs } from '../state/prefs';
import { ForgePanel } from './forge-panel';
import { QuickAccess, openAgentHref } from './quick-access';
import { RepoSwitcher, buildEntries } from './repo-switcher';
import { useTitleBarAction } from './shell-context';
import { MidniteTabBar } from './tab-bar';
import { NAV_HEIGHT, TABS, isTopLevelTabRoute } from './tabs';
import { NO_REPO_TITLE, TitleBar } from './title-bar';

const repoPref = { owner: 'bilo-io', name: 'midnite-studio', defaultBranch: 'main' };
const row = (name: string, isPrivate = false) => ({ owner: 'bilo-io', name, defaultBranch: 'main', pushedAt: '', isPrivate });
const viewer = ok({ login: 'octo', name: 'Octo Cat', avatarUrl: null });
const page = (items: unknown[], nextCursor: string | null = null) => ok({ items, nextCursor });

beforeEach(() => {
  routerCalls.length = 0;
  setSegments(['(tabs)', 'history']);
  resetShellState({ currentRepo: repoPref });
});
afterEach(cleanup);

describe('tabs', () => {
  it('has the five tabs in the documented order', async () => {
    expect(TABS.map((t) => t.label)).toEqual(['History', 'Tasks', 'Reviews', 'Agents', 'More']);
    expect(NAV_HEIGHT).toBe(56);
  });

  it('shows the FAB on top-level tab routes only', async () => {
    expect(isTopLevelTabRoute(['(tabs)', 'tasks'])).toBe(true);
    expect(isTopLevelTabRoute(['(tabs)'])).toBe(true);
    expect(isTopLevelTabRoute(['(tabs)', 'history', 'commit'])).toBe(false);
    expect(isTopLevelTabRoute(['tasks', 'new-issue'])).toBe(false);
  });
});

describe('MidniteTabBar', () => {
  const routes = TABS.map((t) => ({ key: `k-${t.name}`, name: t.name }));
  const calls: string[] = [];
  const bar = () => <MidniteTabBar state={{ index: 0, routes }} navigateToTab={(k) => calls.push(k)} />;

  it('renders the five tabs, marks the active one and navigates by route key', async () => {
    calls.length = 0;
    await renderInShell(bar(), { viewer: async () => viewer, listPulls: async () => page([]) });
    for (const t of TABS) expect(screen.getByText(t.label)).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    fireEvent.click(screen.getByText('Tasks'));
    expect(calls).toEqual(['k-tasks']);
  });

  it('hides the labels at a font scale of 1.3 and keeps each tab named', async () => {
    const spy = vi.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1.3);
    try {
      await renderInShell(bar(), { viewer: async () => viewer, listPulls: async () => page([]) });
      for (const t of TABS) {
        expect(screen.queryByText(t.label)).toBeNull();
        expect(screen.getByLabelText(t.label)).toBeTruthy();
      }
    } finally {
      spy.mockRestore();
    }
  });

  it('badges Reviews with the count of review-requested PRs', async () => {
    await renderInShell(bar(), { listPulls: async () => page([{}, {}, {}]) });
    expect(await screen.findByText('3')).toBeTruthy();
  });
});

describe('TitleBar', () => {
  it('asks for a repo when none is chosen', async () => {
    resetShellState();
    await renderInShell(<TitleBar />, { viewer: async () => viewer });
    expect(screen.getByText(NO_REPO_TITLE)).toBeTruthy();
  });

  it('shows owner/name over the branch, opens the panel and the switcher, and links the avatar to More', async () => {
    await renderInShell(<TitleBar />, { viewer: async () => viewer });
    expect(screen.getByText('bilo-io/midnite-studio')).toBeTruthy();
    expect(screen.getByText('main')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Open forge panel'));
    expect(screen.getByTestId('probe').textContent).toContain('panel:true');
    fireEvent.click(screen.getByText('bilo-io/midnite-studio'));
    expect(screen.getByTestId('probe').textContent).toContain('switcher:true');
    fireEvent.click(screen.getByLabelText('Account'));
    expect(routerCalls).toContainEqual({ method: 'navigate', href: '/(tabs)/more' });
  });

  it('uses the branch stored for the repo', async () => {
    usePrefs.getState().setBranch(repoPref, 'release');
    await renderInShell(<TitleBar />, { viewer: async () => viewer });
    expect(screen.getByText('release')).toBeTruthy();
  });

  it('renders a screen action and drops it when the screen unmounts', async () => {
    function Screen() {
      const node = useMemo(() => <Text>view-switch</Text>, []);
      useTitleBarAction(node);
      return null;
    }
    function Host() {
      const [shown, setShown] = useState(true);
      return (
        <>
          <TitleBar />
          {shown ? <Screen /> : null}
          <Pressable onPress={() => setShown(false)}>
            <Text>unmount</Text>
          </Pressable>
        </>
      );
    }
    await renderInShell(<Host />, { viewer: async () => viewer });
    expect(await screen.findByText('view-switch')).toBeTruthy();
    fireEvent.click(screen.getByText('unmount'));
    expect(screen.queryByText('view-switch')).toBeNull();
  });
});

describe('RepoSwitcher', () => {
  it('orders recents first and filters', async () => {
    const repos = [row('a'), row('b', true), row('c')];
    const recents = [{ owner: 'bilo-io', name: 'c', defaultBranch: 'main' }];
    const out = buildEntries(repos, recents, '');
    expect(out.map((e) => e.key)).toEqual(['h:recent', 'p:bilo-io/c', 'h:all', 'r:bilo-io/a', 'r:bilo-io/b']);
    expect(buildEntries(repos, recents, 'BILO-io/b').map((e) => e.key)).toEqual(['r:bilo-io/b']);
    expect(buildEntries(repos, [], '').map((e) => e.key)).toEqual(['r:bilo-io/a', 'r:bilo-io/b', 'r:bilo-io/c']);
  });

  it('lists repos with a lock for private ones, and choosing one sets the repo and resets the branch', async () => {
    usePrefs.getState().setBranch(repoPref, 'release');
    await renderInShell(
      <>
        <Openers />
        <RepoSwitcher />
      </>,
      { viewer: async () => viewer, listRepos: async () => page([row('alpha'), row('beta', true)]) },
    );
    fireEvent.click(screen.getByLabelText('open-switcher'));
    expect(await screen.findByText('bilo-io/beta')).toBeTruthy();
    expect(screen.getAllByLabelText('icon:lock')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Filter repositories'), { target: { value: 'alp' } });
    expect(screen.queryByText('bilo-io/beta')).toBeNull();
    fireEvent.click(screen.getByText('bilo-io/alpha'));
    expect(usePrefs.getState().currentRepo?.name).toBe('alpha');
    expect(usePrefs.getState().branchByRepo['bilo-io/alpha']).toBeUndefined();
  });

  it('opens itself once when no repo has been chosen', async () => {
    resetShellState();
    await renderInShell(<RepoSwitcher />, { listRepos: async () => page([row('alpha')]) });
    expect(await screen.findByText('bilo-io/alpha')).toBeTruthy();
    expect(screen.getByTestId('probe').textContent).toContain('switcher:true');
  });

  it('pages on end of list is wired to the next cursor', async () => {
    const cursors: (string | null | undefined)[] = [];
    await renderInShell(
      <>
        <Openers />
        <RepoSwitcher />
      </>,
      {
        listRepos: async (c?: string | null) => {
          cursors.push(c);
          return c ? page([row('second')]) : page([row('first')], 'next');
        },
      },
    );
    fireEvent.click(screen.getByLabelText('open-switcher'));
    expect(await screen.findByText('bilo-io/first')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filter repositories'), { target: { value: 'second' } });
    // A filter that matches nothing loaded keeps paging until it does.
    expect(await screen.findByText('bilo-io/second')).toBeTruthy();
    expect(cursors).toEqual([null, 'next']);
  });
});

describe('ForgePanel', () => {
  it('shows the account, the repo and three disabled coming-soon rows', async () => {
    await renderInShell(
      <>
        <Openers />
        <ForgePanel />
      </>,
      { viewer: async () => viewer },
    );
    fireEvent.click(screen.getByLabelText('open-panel'));
    expect(await screen.findByText('@github.com')).toBeTruthy();
    expect(screen.getByText('octo')).toBeTruthy();
    expect(screen.getByText('bilo-io/midnite-studio')).toBeTruthy();
    for (const t of ['Branches', 'Remotes', 'Forge accounts']) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.getAllByText('Coming soon')).toHaveLength(3);
  });
});

describe('QuickAccess', () => {
  const dial = () => renderInShell(<QuickAccess />, { viewer: async () => viewer });

  it('opens a speed dial with the four actions; Notes is inert', async () => {
    await dial();
    fireEvent.click(screen.getByLabelText('Quick actions'));
    for (const l of ['New issue', 'Open agent', 'Switch repo']) expect(screen.getByLabelText(l)).toBeTruthy();
    expect(screen.getByLabelText('Notes, coming soon')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Notes, coming soon'));
    expect(routerCalls).toEqual([]);
  });

  it('routes New issue and Open agent, and Switch repo opens the switcher', async () => {
    await dial();
    fireEvent.click(screen.getByLabelText('Quick actions'));
    fireEvent.click(screen.getByLabelText('New issue'));
    expect(routerCalls).toContainEqual({ method: 'push', href: '/tasks/new-issue' });
    fireEvent.click(screen.getByLabelText('Quick actions'));
    fireEvent.click(screen.getByLabelText('Open agent'));
    expect(routerCalls).toContainEqual({ method: 'navigate', href: '/(tabs)/agents' });
    fireEvent.click(screen.getByLabelText('Quick actions'));
    fireEvent.click(screen.getByLabelText('Switch repo'));
    expect(screen.getByTestId('probe').textContent).toContain('switcher:true');
  });

  it('opens the last-used provider when there is one', async () => {
    expect(openAgentHref(null)).toBe('/(tabs)/agents');
    expect(openAgentHref('claude')).toBe('/(tabs)/agents?open=claude');
  });

  it('steps aside while the keyboard is up and returns after', async () => {
    const handlers: Record<string, () => void> = {};
    const spy = vi.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, cb: () => void) => {
      handlers[name] = cb;
      return { remove: () => undefined };
    }) as never);
    try {
      await dial();
      expect(screen.getByLabelText('Quick actions')).toBeTruthy();
      act(() => (handlers.keyboardDidShow ?? handlers.keyboardWillShow)!());
      await waitFor(() => expect(screen.queryByLabelText('Quick actions')).toBeNull());
      act(() => (handlers.keyboardDidHide ?? handlers.keyboardWillHide)!());
      await waitFor(() => expect(screen.getByLabelText('Quick actions')).toBeTruthy());
    } finally {
      spy.mockRestore();
    }
  });

  it('is hidden on a detail route', async () => {
    setSegments(['(tabs)', 'history', 'abc123']);
    await dial();
    expect(screen.queryByLabelText('Quick actions')).toBeNull();
  });
});
