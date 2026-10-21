import { beforeEach, describe, expect, it } from 'vitest';

import {
  nextFocusAfterClose,
  tabId,
  useWorkbenchStore,
  type WorkbenchTab,
} from './workbench-store';

const reset = () =>
  useWorkbenchStore.setState({
    tabs: [],
    activeQueryTabId: null,
    dirtyQueryTabIds: new Set(),
  });

const queryTab = (connectionId: string, label: string, sql = '') =>
  ({ kind: 'query', connectionId, label, sql }) as const;

describe('tabId', () => {
  it('derives identity from the connection and label, not the sql', () => {
    expect(tabId(queryTab('c1', 'orders', 'SELECT 1'))).toBe('query:c1:orders');
    expect(tabId(queryTab('c1', 'orders', 'SELECT 2'))).toBe('query:c1:orders');
    expect(tabId(queryTab('c2', 'orders'))).not.toBe(tabId(queryTab('c1', 'orders')));
  });
});

describe('query tabs (Phase 61 Theme G, Decision 7)', () => {
  beforeEach(reset);

  it('opens into activeQueryTabId', () => {
    useWorkbenchStore.getState().openTab(queryTab('c1', 'Query 1'));
    const state = useWorkbenchStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.activeQueryTabId).toBe('query:c1:Query 1');
  });

  it('reopening the same connectionId+label refocuses rather than duplicating', () => {
    const store = useWorkbenchStore.getState();
    store.openTab(queryTab('c1', 'orders', 'SELECT 1'));
    store.openTab(queryTab('c1', 'Query 2'));
    store.openTab(queryTab('c1', 'orders', 'SELECT * FROM orders LIMIT 200'));
    const { tabs, activeQueryTabId } = useWorkbenchStore.getState();
    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.sql).toBe('SELECT * FROM orders LIMIT 200');
    expect(activeQueryTabId).toBe('query:c1:orders');
  });

  it('closing the focused tab falls back to its left neighbour', () => {
    const store = useWorkbenchStore.getState();
    store.openTab(queryTab('c1', 'Query 1'));
    store.openTab(queryTab('c1', 'Query 2'));

    store.closeTab('query:c1:Query 2');
    const state = useWorkbenchStore.getState();
    expect(state.tabs.map((tab) => tab.id)).toEqual(['query:c1:Query 1']);
    expect(state.activeQueryTabId).toBe('query:c1:Query 1');
  });

  it('focusTab moves the cursor', () => {
    const store = useWorkbenchStore.getState();
    store.openTab(queryTab('c1', 'Query 1'));
    store.openTab(queryTab('c1', 'Query 2'));
    store.focusTab('query:c1:Query 1');
    expect(useWorkbenchStore.getState().activeQueryTabId).toBe('query:c1:Query 1');
  });

  it('updateQueryTabSql edits the tab and marks it dirty; markQueryTabClean clears it', () => {
    const store = useWorkbenchStore.getState();
    store.openTab(queryTab('c1', 'Query 1', ''));
    const id = 'query:c1:Query 1';

    store.updateQueryTabSql(id, 'SELECT 1');
    let state = useWorkbenchStore.getState();
    expect(state.tabs[0]?.sql).toBe('SELECT 1');
    expect(state.dirtyQueryTabIds.has(id)).toBe(true);

    store.markQueryTabClean(id);
    state = useWorkbenchStore.getState();
    expect(state.dirtyQueryTabIds.has(id)).toBe(false);
  });
});

describe('nextFocusAfterClose', () => {
  const tabs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as unknown as WorkbenchTab[];

  it('picks the left neighbour of the focused tab', () => {
    expect(nextFocusAfterClose(tabs, 'b', 'b')).toBe('a');
  });

  it('falls back to none when the first tab closes', () => {
    expect(nextFocusAfterClose(tabs, 'a', 'a')).toBeNull();
  });

  it('is a no-op for a tab that is not focused', () => {
    expect(nextFocusAfterClose(tabs, 'a', 'c')).toBe('a');
  });

  it('handles a tab that is not in the list', () => {
    expect(nextFocusAfterClose(tabs, 'zz', 'zz')).toBeNull();
  });
});
