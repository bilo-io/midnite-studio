import { beforeEach, describe, expect, it } from 'vitest';

import { PREVIEW_DEPLOY_HOSTS } from '../features/browser/preview-deploy';

import {
  clampZoomFactor,
  derivedGroupIds,
  effectiveGroupId,
  nextActiveAfterClose,
  pushRecentOrigin,
  useBrowserStore,
  type BrowserShortcutTile,
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
  useBrowserStore.setState({
    tabs: [],
    groups: [],
    activeTabId: null,
    recentlyClosed: [],
    previewDeployHosts: [...PREVIEW_DEPLOY_HOSTS],
    recents: [],
    tiles: [],
    wallpaperTheme: 'nature',
  });
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

  it('openTabFrom with foreground=false (Mod+click / middle-click) inserts the tab without activating it', () => {
    useBrowserStore.setState({ tabs: [tab('x'), tab('y')], groups: [], activeTabId: 'x' });
    const id = useBrowserStore.getState().openTabFrom('x', 'https://opened.example', false);
    const state = useBrowserStore.getState();
    expect(state.tabs.map((t) => t.id)).toEqual(['x', id, 'y']);
    expect(state.activeTabId).toBe('x');
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

  /*
    Phase 71 Theme C. Phase 32 shipped the width picker as component-local
    `useState` in `browser-pane.tsx`, so it reset every time the pane closed
    — for a control whose whole use is "keep looking at this page narrow",
    that is the one thing it must not do.
  */
  describe('the viewport preset', () => {
    it('is per tab, so narrowing one leaves the others full width', () => {
      useBrowserStore.setState({ tabs: [tab('a'), tab('b')], groups: [], activeTabId: 'a' });

      useBrowserStore.getState().setViewportPreset('a', '390');

      const state = useBrowserStore.getState();
      expect(state.tabs[0]?.viewportPreset).toBe('390');
      expect(state.tabs[1]?.viewportPreset).toBeUndefined();
    });

    it('is a no-op for a tab that is not open', () => {
      useBrowserStore.setState({ tabs: [tab('a')], groups: [], activeTabId: 'a' });
      useBrowserStore.getState().setViewportPreset('gone', '834');
      expect(useBrowserStore.getState().tabs[0]?.viewportPreset).toBeUndefined();
    });

    // `partialize` spreads each tab, so the preset rides along with it — which
    // is the whole point of moving it out of the component.
    it('survives the persist round trip', () => {
      useBrowserStore.setState({ tabs: [tab('a')], groups: [], activeTabId: 'a' });
      useBrowserStore.getState().setViewportPreset('a', '1280');

      const partialize = useBrowserStore.persist.getOptions().partialize;
      const persisted = partialize?.(useBrowserStore.getState()) as {
        tabs: { viewportPreset?: string }[];
      };

      expect(persisted.tabs[0]?.viewportPreset).toBe('1280');
    });
  });

  describe('the preview-deploy allowlist (Phase 71 Theme D)', () => {
    it('is seeded with the seven public hosts', () => {
      expect(useBrowserStore.getState().previewDeployHosts).toEqual(PREVIEW_DEPLOY_HOSTS);
    });

    it('setPreviewDeployHosts replaces the whole list', () => {
      useBrowserStore.getState().setPreviewDeployHosts(['example-hosting.dev']);
      expect(useBrowserStore.getState().previewDeployHosts).toEqual(['example-hosting.dev']);
    });

    it('survives the persist round trip', () => {
      useBrowserStore.getState().setPreviewDeployHosts(['example-hosting.dev']);
      const partialize = useBrowserStore.persist.getOptions().partialize;
      const persisted = partialize?.(useBrowserStore.getState()) as {
        previewDeployHosts: string[];
      };
      expect(persisted.previewDeployHosts).toEqual(['example-hosting.dev']);
    });
  });
});

describe('pushRecentOrigin', () => {
  it('caps at 8 distinct origins, evicting the oldest', () => {
    let recents: string[] = [];
    for (let i = 0; i < 9; i += 1) {
      recents = pushRecentOrigin(recents, `https://site-${i}.example`);
    }
    expect(recents).toHaveLength(8);
    expect(recents[0]).toBe('https://site-8.example');
    expect(recents).not.toContain('https://site-0.example');
  });

  it('promotes a re-visited origin to the front rather than duplicating it', () => {
    let recents = pushRecentOrigin([], 'https://a.example');
    recents = pushRecentOrigin(recents, 'https://b.example');
    recents = pushRecentOrigin(recents, 'https://a.example/some/path');
    expect(recents).toEqual(['https://a.example', 'https://b.example']);
  });

  it('leaves the list untouched for an unparseable URL', () => {
    const recents = pushRecentOrigin(['https://a.example'], 'not a url');
    expect(recents).toEqual(['https://a.example']);
  });
});

describe('recents (Phase 32 Theme F)', () => {
  beforeEach(() => {
    useBrowserStore.setState({
      tabs: [tab('a')],
      groups: [],
      activeTabId: 'a',
      recentlyClosed: [],
      previewDeployHosts: [...PREVIEW_DEPLOY_HOSTS],
      recents: [],
      tiles: [],
      wallpaperTheme: 'nature',
    });
  });

  it('updateTabState pushes the navigated origin into recents', () => {
    useBrowserStore.getState().updateTabState('a', { url: 'https://example.com/page' });
    expect(useBrowserStore.getState().recents).toEqual(['https://example.com']);
  });

  it('a patch with no url leaves recents untouched', () => {
    useBrowserStore.setState({ recents: ['https://example.com'] });
    useBrowserStore.getState().updateTabState('a', { title: 'New title' });
    expect(useBrowserStore.getState().recents).toEqual(['https://example.com']);
  });

  it('clearRecents empties the list', () => {
    useBrowserStore.setState({ recents: ['https://example.com'] });
    useBrowserStore.getState().clearRecents();
    expect(useBrowserStore.getState().recents).toEqual([]);
  });

  it('survives the persist round trip', () => {
    useBrowserStore.setState({ recents: ['https://example.com'] });
    const partialize = useBrowserStore.persist.getOptions().partialize;
    const persisted = partialize?.(useBrowserStore.getState()) as { recents: string[] };
    expect(persisted.recents).toEqual(['https://example.com']);
  });
});

describe('tiles (Phase 32 Theme F)', () => {
  const seedTile = (id: string): BrowserShortcutTile => ({
    id,
    label: id,
    url: `https://${id}.example`,
    brandColor: '#000',
    bgColor: '#fff',
  });

  beforeEach(() => {
    useBrowserStore.setState({ tiles: [seedTile('one'), seedTile('two')] });
  });

  it('addTile appends a tile with no iconKey and returns its id', () => {
    const id = useBrowserStore.getState().addTile({
      label: 'Three',
      url: 'https://three.example',
      brandColor: '#111',
      bgColor: '#222',
    });
    const tiles = useBrowserStore.getState().tiles;
    expect(tiles).toHaveLength(3);
    expect(tiles[2]?.id).toBe(id);
    expect(tiles[2]?.label).toBe('Three');
    expect(tiles[2]?.iconKey).toBeUndefined();
  });

  it('removeTile drops the matching tile', () => {
    useBrowserStore.getState().removeTile('one');
    expect(useBrowserStore.getState().tiles.map((t) => t.id)).toEqual(['two']);
  });

  it('renameTile updates only the label', () => {
    useBrowserStore.getState().renameTile('one', 'Renamed');
    const tile = useBrowserStore.getState().tiles.find((t) => t.id === 'one');
    expect(tile?.label).toBe('Renamed');
    expect(tile?.url).toBe('https://one.example');
  });

  it('reorderTiles applies the full new order', () => {
    useBrowserStore.getState().reorderTiles(['two', 'one']);
    expect(useBrowserStore.getState().tiles.map((t) => t.id)).toEqual(['two', 'one']);
  });

  it('reorderTiles is a no-op when the id set does not match', () => {
    useBrowserStore.getState().reorderTiles(['one']);
    expect(useBrowserStore.getState().tiles.map((t) => t.id)).toEqual(['one', 'two']);
  });

  it('survives the persist round trip', () => {
    const partialize = useBrowserStore.persist.getOptions().partialize;
    const persisted = partialize?.(useBrowserStore.getState()) as {
      tiles: BrowserShortcutTile[];
    };
    expect(persisted.tiles.map((t) => t.id)).toEqual(['one', 'two']);
  });
});

describe('wallpaperTheme (Phase 32 Theme F)', () => {
  it('setWallpaperTheme replaces the theme', () => {
    useBrowserStore.getState().setWallpaperTheme('cyberpunk');
    expect(useBrowserStore.getState().wallpaperTheme).toBe('cyberpunk');
  });

  it('survives the persist round trip', () => {
    useBrowserStore.getState().setWallpaperTheme('space');
    const partialize = useBrowserStore.persist.getOptions().partialize;
    const persisted = partialize?.(useBrowserStore.getState()) as { wallpaperTheme: string };
    expect(persisted.wallpaperTheme).toBe('space');
  });

  it('v1 -> v2 migration carries the legacy localStorage theme forward, once', () => {
    localStorage.setItem('midnite-studio.browser.wallpaper-theme', 'cyberpunk');
    const migrate = useBrowserStore.persist.getOptions().migrate as (
      persisted: unknown,
      version: number,
    ) => { wallpaperTheme: string };

    const migrated = migrate({ activeTabId: null }, 1);

    expect(migrated.wallpaperTheme).toBe('cyberpunk');
    expect(localStorage.getItem('midnite-studio.browser.wallpaper-theme')).toBeNull();
  });

  it('v1 -> v2 migration defaults to nature when no legacy key is present', () => {
    const migrate = useBrowserStore.persist.getOptions().migrate as (
      persisted: unknown,
      version: number,
    ) => { wallpaperTheme: string };

    const migrated = migrate({ activeTabId: null }, 1);

    expect(migrated.wallpaperTheme).toBe('nature');
  });

  it('v1 -> v2 migration ignores an unparseable legacy value', () => {
    localStorage.setItem('midnite-studio.browser.wallpaper-theme', 'not-a-real-theme');
    const migrate = useBrowserStore.persist.getOptions().migrate as (
      persisted: unknown,
      version: number,
    ) => { wallpaperTheme: string };

    const migrated = migrate({ activeTabId: null }, 1);

    expect(migrated.wallpaperTheme).toBe('nature');
  });

  it('leaves an already-v2 payload untouched', () => {
    const migrate = useBrowserStore.persist.getOptions().migrate as (
      persisted: unknown,
      version: number,
    ) => { wallpaperTheme?: string };

    const migrated = migrate({ wallpaperTheme: 'space' }, 2);

    expect(migrated.wallpaperTheme).toBe('space');
  });
});

describe('clampZoomFactor', () => {
  it('clamps to the 0.25..5 range BrowserZoomRequest enforces', () => {
    expect(clampZoomFactor(0.1)).toBe(0.25);
    expect(clampZoomFactor(10)).toBe(5);
    expect(clampZoomFactor(1.23456)).toBe(1.23);
  });
});

describe('zoomByOrigin (Phase 32 Theme G)', () => {
  beforeEach(() => {
    useBrowserStore.setState({ zoomByOrigin: {} });
  });

  it('setZoomForOrigin keys by origin, not by tab', () => {
    useBrowserStore.getState().setZoomForOrigin('https://a.example', 1.5);
    useBrowserStore.getState().setZoomForOrigin('https://b.example', 0.8);
    expect(useBrowserStore.getState().zoomByOrigin).toEqual({
      'https://a.example': 1.5,
      'https://b.example': 0.8,
    });
  });

  it('survives the persist round trip, and a pre-Theme-G payload migrates to an empty map', () => {
    useBrowserStore.getState().setZoomForOrigin('https://a.example', 2);
    const partialize = useBrowserStore.persist.getOptions().partialize;
    const persisted = partialize?.(useBrowserStore.getState()) as {
      zoomByOrigin: Record<string, number>;
    };
    expect(persisted.zoomByOrigin).toEqual({ 'https://a.example': 2 });

    const migrate = useBrowserStore.persist.getOptions().migrate as (
      persisted: unknown,
      version: number,
    ) => { zoomByOrigin: Record<string, number> };
    expect(migrate({ activeTabId: null }, 2).zoomByOrigin).toEqual({});
  });
});

describe('find (Phase 32 Theme G)', () => {
  beforeEach(() => {
    useBrowserStore.setState({ findOpen: false, findResult: null });
  });

  it('toggleFind flips findOpen and clears findResult on close', () => {
    useBrowserStore.setState({ findResult: { matches: 3, activeMatchOrdinal: 1 } });
    useBrowserStore.getState().toggleFind();
    expect(useBrowserStore.getState().findOpen).toBe(true);
    // Opening leaves a pre-existing result alone — only closing clears it.
    expect(useBrowserStore.getState().findResult).toEqual({ matches: 3, activeMatchOrdinal: 1 });

    useBrowserStore.getState().toggleFind();
    expect(useBrowserStore.getState().findOpen).toBe(false);
    expect(useBrowserStore.getState().findResult).toBeNull();
  });

  it('closeFind clears both findOpen and findResult directly', () => {
    useBrowserStore.setState({
      findOpen: true,
      findResult: { matches: 2, activeMatchOrdinal: 2 },
    });
    useBrowserStore.getState().closeFind();
    expect(useBrowserStore.getState().findOpen).toBe(false);
    expect(useBrowserStore.getState().findResult).toBeNull();
  });

  it('setFindResult stores the latest found-in-page count', () => {
    useBrowserStore.getState().setFindResult({ matches: 4, activeMatchOrdinal: 2 });
    expect(useBrowserStore.getState().findResult).toEqual({ matches: 4, activeMatchOrdinal: 2 });
  });

  it('neither findOpen nor findResult survives the persist round trip', () => {
    useBrowserStore.setState({
      findOpen: true,
      findResult: { matches: 1, activeMatchOrdinal: 1 },
    });
    const partialize = useBrowserStore.persist.getOptions().partialize;
    const persisted = partialize?.(useBrowserStore.getState()) as Record<string, unknown>;
    expect(persisted).not.toHaveProperty('findOpen');
    expect(persisted).not.toHaveProperty('findResult');
  });
});
