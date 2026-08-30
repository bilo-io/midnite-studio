import { beforeEach, describe, expect, it } from 'vitest';

import {
  derivedGroupIds,
  effectiveGroupId,
  nextActiveAfterClose,
  useBrowserStore,
  type BrowserTab,
} from './browser-store';

const tab = (id: string, extra: Partial<BrowserTab> = {}): BrowserTab => ({
  id,
  kind: 'page',
  url: `https://${id}.example`,
  title: id,
  loading: false,
  canGoBack: false,
  canGoForward: false,
  ...extra,
});

beforeEach(() => {
  useBrowserStore.setState({ tabs: [], groups: [], activeTabId: null, recentlyClosed: [] });
});

describe('nextActiveAfterClose', () => {
  it('activates the right neighbour when the active tab closes', () => {
    const tabs = [tab('a'), tab('b'), tab('c')];
    expect(nextActiveAfterClose(tabs, 'b', 'b')).toBe('c');
  });

  it('falls back to the left neighbour when there is no right one', () => {
    const tabs = [tab('a'), tab('b'), tab('c')];
    expect(nextActiveAfterClose(tabs, 'c', 'c')).toBe('b');
  });

  it('returns null when the closing tab was the only one', () => {
    const tabs = [tab('a')];
    expect(nextActiveAfterClose(tabs, 'a', 'a')).toBeNull();
  });

  it('leaves an inactive tab closing untouched', () => {
    const tabs = [tab('a'), tab('b')];
    expect(nextActiveAfterClose(tabs, 'a', 'b')).toBe('a');
  });
});

describe('effectiveGroupId', () => {
  const manual = new Set(['g1']);

  it('resolves an explicit manual group', () => {
    expect(effectiveGroupId(tab('a', { groupId: 'g1' }), manual)).toBe('g1');
  });

  it('resolves an explicit null as ungrouped, even with an originRepoId', () => {
    expect(effectiveGroupId(tab('a', { groupId: null, originRepoId: 'repo1' }), manual)).toBeNull();
  });

  it('derives repo:<id> when there is no explicit choice', () => {
    expect(effectiveGroupId(tab('a', { originRepoId: 'repo1' }), manual)).toBe('repo:repo1');
  });

  it('is ungrouped with no explicit choice and no originRepoId', () => {
    expect(effectiveGroupId(tab('a'), manual)).toBeNull();
  });

  it('falls back to ungrouped when the manual groupId no longer exists', () => {
    expect(effectiveGroupId(tab('a', { groupId: 'deleted' }), manual)).toBeNull();
  });
});

describe('derivedGroupIds', () => {
  it('lists one entry per distinct originRepoId with no explicit choice', () => {
    const tabs = [
      tab('a', { originRepoId: 'r1' }),
      tab('b', { originRepoId: 'r1' }),
      tab('c', { originRepoId: 'r2' }),
      tab('d'),
    ];
    expect(derivedGroupIds(tabs).sort()).toEqual(['repo:r1', 'repo:r2']);
  });

  it('appears once the first tab of a repo opens, and disappears once the last closes', () => {
    useBrowserStore.setState({ tabs: [], activeTabId: null });
    const id = useBrowserStore.getState().openTab('https://x.example', 'r1');
    expect(derivedGroupIds(useBrowserStore.getState().tabs)).toEqual(['repo:r1']);

    useBrowserStore.getState().closeTab(id);
    // closeTab never leaves zero tabs — it opens a fresh blank one instead,
    // which carries no originRepoId at all.
    expect(derivedGroupIds(useBrowserStore.getState().tabs)).toEqual([]);
  });
});

describe('useBrowserStore reducers', () => {
  it('openTab with no url opens a blank newtab kind and focuses it', () => {
    const id = useBrowserStore.getState().openTab();
    const state = useBrowserStore.getState();
    expect(state.activeTabId).toBe(id);
    expect(state.tabs[0]).toMatchObject({ kind: 'newtab', url: '' });
  });

  it('closeTab activates the right neighbour then the left, per nextActiveAfterClose', () => {
    useBrowserStore.setState({ tabs: [tab('a'), tab('b'), tab('c')], activeTabId: 'b' });
    useBrowserStore.getState().closeTab('b');
    const state = useBrowserStore.getState();
    expect(state.tabs.map((t) => t.id)).toEqual(['a', 'c']);
    expect(state.activeTabId).toBe('c');
  });

  it('closing the last tab leaves exactly one fresh new tab, not zero', () => {
    useBrowserStore.setState({ tabs: [tab('a')], activeTabId: 'a' });
    useBrowserStore.getState().closeTab('a');
    const state = useBrowserStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.kind).toBe('newtab');
    expect(state.activeTabId).toBe(state.tabs[0]?.id);
  });

  it('reopenClosed restores the tab at its original position', () => {
    useBrowserStore.setState({ tabs: [tab('a'), tab('b'), tab('c')], activeTabId: 'a' });
    useBrowserStore.getState().closeTab('b');
    expect(useBrowserStore.getState().tabs.map((t) => t.id)).toEqual(['a', 'c']);

    useBrowserStore.getState().reopenClosed();
    const state = useBrowserStore.getState();
    expect(state.tabs.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(state.activeTabId).toBe('b');
  });

  it('reorderTabs accepts the full new order, matching the SortableList contract', () => {
    useBrowserStore.setState({ tabs: [tab('a'), tab('b'), tab('c')], activeTabId: 'a' });
    useBrowserStore.getState().reorderTabs(['c', 'a', 'b']);
    expect(useBrowserStore.getState().tabs.map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });

  it('ignores a reorder whose id set does not match the current tabs', () => {
    useBrowserStore.setState({ tabs: [tab('a'), tab('b')], activeTabId: 'a' });
    useBrowserStore.getState().reorderTabs(['a', 'b', 'ghost']);
    expect(useBrowserStore.getState().tabs.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('activateNth selects the nth tab, 1-indexed, clamped to the last', () => {
    useBrowserStore.setState({ tabs: [tab('a'), tab('b'), tab('c')], activeTabId: 'a' });
    useBrowserStore.getState().activateNth(2);
    expect(useBrowserStore.getState().activeTabId).toBe('b');
  });

  it('activateNth(9) always selects the last tab regardless of count', () => {
    useBrowserStore.setState({ tabs: [tab('a'), tab('b'), tab('c')], activeTabId: 'a' });
    useBrowserStore.getState().activateNth(9);
    expect(useBrowserStore.getState().activeTabId).toBe('c');
  });

  it('cycleTab wraps around in both directions', () => {
    useBrowserStore.setState({ tabs: [tab('a'), tab('b'), tab('c')], activeTabId: 'c' });
    useBrowserStore.getState().cycleTab(1);
    expect(useBrowserStore.getState().activeTabId).toBe('a');
    useBrowserStore.getState().cycleTab(-1);
    expect(useBrowserStore.getState().activeTabId).toBe('c');
  });

  it('moveTabToGroup relocates a tab to sit adjacent to its new group, keeping the group contiguous', () => {
    // 'z' is on the far side of an ungrouped tab, so joining g1 has to MOVE
    // it — otherwise the strip would draw the same group twice.
    useBrowserStore.setState({
      tabs: [tab('x', { groupId: 'g1' }), tab('y'), tab('z')],
      groups: [{ id: 'g1', name: 'Work', color: '--tab-group-1', collapsed: false }],
      activeTabId: 'x',
    });
    useBrowserStore.getState().moveTabToGroup('z', 'g1');
    const state = useBrowserStore.getState();
    expect(state.tabs.map((t) => t.id)).toEqual(['x', 'z', 'y']);
    expect(state.tabs.find((t) => t.id === 'z')?.groupId).toBe('g1');
  });

  it('leaving a group moves nothing — the tab stays where the user put it', () => {
    useBrowserStore.setState({
      tabs: [tab('x', { groupId: 'g1' }), tab('y', { groupId: 'g1' }), tab('z')],
      groups: [{ id: 'g1', name: 'Work', color: '--tab-group-1', collapsed: false }],
      activeTabId: 'x',
    });
    useBrowserStore.getState().moveTabToGroup('x', null);
    const state = useBrowserStore.getState();
    expect(state.tabs.map((t) => t.id)).toEqual(['x', 'y', 'z']);
    expect(state.tabs[0]?.groupId).toBeNull();
  });

  it('moveTabToGroup relocates into a DERIVED group too, addressed by its repo: id', () => {
    useBrowserStore.setState({
      tabs: [tab('x', { originRepoId: 'r1' }), tab('y'), tab('z')],
      groups: [],
      activeTabId: 'x',
    });
    useBrowserStore.getState().moveTabToGroup('z', 'repo:r1');
    expect(useBrowserStore.getState().tabs.map((t) => t.id)).toEqual(['x', 'z', 'y']);
  });

  it('openTabFrom lands beside its opener and inherits its group', () => {
    useBrowserStore.setState({
      tabs: [tab('x', { groupId: 'g1', originRepoId: 'r1' }), tab('y')],
      groups: [{ id: 'g1', name: 'Work', color: '--tab-group-1', collapsed: false }],
      activeTabId: 'x',
    });
    const id = useBrowserStore.getState().openTabFrom('x', 'https://opened.example');
    const state = useBrowserStore.getState();
    expect(state.tabs.map((t) => t.id)).toEqual(['x', id, 'y']);
    expect(state.activeTabId).toBe(id);
    const opened = state.tabs[1];
    expect(opened).toMatchObject({ groupId: 'g1', originRepoId: 'r1', kind: 'page' });
  });

  it('openTabFrom for an opener that has already closed appends rather than throwing', () => {
    useBrowserStore.setState({ tabs: [tab('x')], groups: [], activeTabId: 'x' });
    const id = useBrowserStore.getState().openTabFrom('gone', 'https://opened.example');
    expect(useBrowserStore.getState().tabs.map((t) => t.id)).toEqual(['x', id]);
  });

  it('ungroupKeepTabs deletes the group but keeps its tabs, reverting them to no explicit choice', () => {
    useBrowserStore.setState({
      tabs: [tab('a', { groupId: 'g1' })],
      groups: [{ id: 'g1', name: 'Work', color: '--tab-group-1', collapsed: false }],
      activeTabId: 'a',
    });
    useBrowserStore.getState().ungroupKeepTabs('g1');
    const state = useBrowserStore.getState();
    expect(state.groups).toHaveLength(0);
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.groupId).toBeUndefined();
  });

  it('closeTabsInGroup closes every tab in a manual group and leaves one fresh tab if that empties the strip', () => {
    useBrowserStore.setState({
      tabs: [tab('a', { groupId: 'g1' }), tab('b', { groupId: 'g1' })],
      groups: [{ id: 'g1', name: 'Work', color: '--tab-group-1', collapsed: false }],
      activeTabId: 'a',
    });
    useBrowserStore.getState().closeTabsInGroup('g1');
    const state = useBrowserStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.groupId).toBeUndefined();
  });
});
