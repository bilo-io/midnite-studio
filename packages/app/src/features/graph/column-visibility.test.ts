import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GRAPH_COLUMN_VISIBILITY,
  GRAPH_COLUMN_MENU,
  hiddenColumnTokens,
  normalizeColumnVisibility,
  withColumnVisible,
} from './column-visibility';
import { useUiStore } from '../../store/ui-store';

describe('column visibility', () => {
  it('defaults: everything on except Diff', () => {
    expect(DEFAULT_GRAPH_COLUMN_VISIBILITY).toEqual({ branchTag: true, author: true, sha: true, diff: false });
    expect(hiddenColumnTokens(DEFAULT_GRAPH_COLUMN_VISIBILITY)).toBe('diff');
  });

  it('locks Commit message, Date and Graph', () => {
    expect(GRAPH_COLUMN_MENU.filter((c) => c.locked).map((c) => c.id).sort()).toEqual(['date', 'graph', 'message']);
  });

  it('puts Diff immediately after Commit message', () => {
    const ids = GRAPH_COLUMN_MENU.map((c) => c.id);
    expect(ids.indexOf('diff')).toBe(ids.indexOf('message') + 1);
  });

  it('toggles a column and ignores locked ones', () => {
    const on = withColumnVisible(DEFAULT_GRAPH_COLUMN_VISIBILITY, 'diff', true);
    expect(on.diff).toBe(true);
    expect(withColumnVisible(on, 'date', false)).toBe(on);
    expect(withColumnVisible(on, 'message', false)).toBe(on);
  });

  it('normalises a stale or junk persisted blob', () => {
    expect(normalizeColumnVisibility(undefined)).toEqual(DEFAULT_GRAPH_COLUMN_VISIBILITY);
    expect(normalizeColumnVisibility({ sha: false, nope: false, author: 'x' })).toEqual({
      branchTag: true,
      author: true,
      sha: false,
      diff: false,
    });
  });

  it('the store setter persists a toggle and refuses locked columns', () => {
    useUiStore.getState().setGraphColumnVisible('diff', true);
    expect(useUiStore.getState().graphColumnVisibility.diff).toBe(true);
    useUiStore.getState().setGraphColumnVisible('date', false);
    expect(useUiStore.getState().graphColumnVisibility).not.toHaveProperty('date');
    useUiStore.getState().setGraphColumnVisible('diff', false);
  });
});
