import { beforeEach, describe, expect, it } from 'vitest';

import {
  nextFocusAfterClose,
  tabId,
  useWorkbenchStore,
  type WorkbenchTab,
} from './workbench-store';

const allChanges = (repoId: string, worktreePath: string) =>
  ({ kind: 'all-changes', repoId, worktreePath, label: worktreePath }) as const;

const reset = () => useWorkbenchStore.setState({ tabs: [], activeTabId: null });

describe('tabId', () => {
  it('derives identity from what the tab points at', () => {
    expect(tabId(allChanges('r1', '/w/main'))).toBe('all-changes:r1:/w/main');
    expect(tabId({ kind: 'review', repoId: 'r1', number: 42, label: '', url: '' })).toBe(
      'review:r1:42',
    );
  });

  it('keeps two repos' + ' worktrees at the same path apart', () => {
    // Two repos can both have a worktree at ~/code/main after a move.
    expect(tabId(allChanges('r1', '/w'))).not.toBe(tabId(allChanges('r2', '/w')));
  });
});

describe('useWorkbenchStore', () => {
  beforeEach(reset);

  it('opens and focuses a tab', () => {
    useWorkbenchStore.getState().openTab(allChanges('r1', '/w/main'));
    const { tabs, activeTabId } = useWorkbenchStore.getState();
    expect(tabs).toHaveLength(1);
    expect(activeTabId).toBe('all-changes:r1:/w/main');
  });

  it('focuses an already-open tab instead of stacking a duplicate', () => {
    const store = useWorkbenchStore.getState();
    store.openTab(allChanges('r1', '/w/main'));
    store.openTab(allChanges('r1', '/w/feat'));
    store.openTab(allChanges('r1', '/w/main'));

    const { tabs, activeTabId } = useWorkbenchStore.getState();
    expect(tabs.map((tab) => tab.id)).toEqual(['all-changes:r1:/w/main', 'all-changes:r1:/w/feat']);
    expect(activeTabId).toBe('all-changes:r1:/w/main');
  });

  it('refreshes a re-opened tab label without moving it', () => {
    const store = useWorkbenchStore.getState();
    store.openTab(allChanges('r1', '/w/main'));
    store.openTab(allChanges('r1', '/w/feat'));
    store.openTab({ ...allChanges('r1', '/w/main'), label: 'renamed' });

    const { tabs } = useWorkbenchStore.getState();
    expect(tabs[0]?.label).toBe('renamed');
    expect(tabs[0]?.id).toBe('all-changes:r1:/w/main');
  });

  it('falls back to the left neighbour when the active tab closes', () => {
    const store = useWorkbenchStore.getState();
    store.openTab(allChanges('r1', '/a'));
    store.openTab(allChanges('r1', '/b'));
    store.openTab(allChanges('r1', '/c'));

    useWorkbenchStore.getState().closeTab('all-changes:r1:/c');
    expect(useWorkbenchStore.getState().activeTabId).toBe('all-changes:r1:/b');
  });

  it('lands on the working-tree tab when the first tab closes', () => {
    useWorkbenchStore.getState().openTab(allChanges('r1', '/a'));
    useWorkbenchStore.getState().closeTab('all-changes:r1:/a');
    expect(useWorkbenchStore.getState().activeTabId).toBeNull();
  });

  it('leaves focus alone when a background tab closes', () => {
    const store = useWorkbenchStore.getState();
    store.openTab(allChanges('r1', '/a'));
    store.openTab(allChanges('r1', '/b'));

    useWorkbenchStore.getState().closeTab('all-changes:r1:/a');
    expect(useWorkbenchStore.getState().activeTabId).toBe('all-changes:r1:/b');
  });

  it('drops a closed repo tabs and rescues the focus', () => {
    const store = useWorkbenchStore.getState();
    store.openTab(allChanges('r1', '/a'));
    store.openTab(allChanges('r2', '/b'));
    useWorkbenchStore.getState().focusTab('all-changes:r2:/b');

    useWorkbenchStore.getState().closeRepoTabs('r2');
    const { tabs, activeTabId } = useWorkbenchStore.getState();
    expect(tabs.map((tab) => tab.repoId)).toEqual(['r1']);
    // The focused tab went with the repo, so focus must not point at a ghost.
    expect(activeTabId).toBeNull();
  });

  it('keeps the focus when the closed repo was not the focused one', () => {
    const store = useWorkbenchStore.getState();
    store.openTab(allChanges('r1', '/a'));
    store.openTab(allChanges('r2', '/b'));
    useWorkbenchStore.getState().focusTab('all-changes:r1:/a');

    useWorkbenchStore.getState().closeRepoTabs('r2');
    expect(useWorkbenchStore.getState().activeTabId).toBe('all-changes:r1:/a');
  });
});

describe('nextFocusAfterClose', () => {
  const tabs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as unknown as WorkbenchTab[];

  it('is a no-op for a tab that is not focused', () => {
    expect(nextFocusAfterClose(tabs, 'a', 'c')).toBe('a');
  });

  it('handles a tab that is not in the list', () => {
    expect(nextFocusAfterClose(tabs, 'zz', 'zz')).toBeNull();
  });
});
