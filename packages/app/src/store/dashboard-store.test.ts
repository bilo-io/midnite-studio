import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_LAYOUT } from '../features/dashboard/widget-ids';
import { boardFor, DEFAULT_BOARD, inReadingOrder, useDashboardStore } from './dashboard-store';

const reset = () => useDashboardStore.setState({ boards: {} });
const board = (repoId: string) => useDashboardStore.getState().boards[repoId];

beforeEach(reset);

describe('boardFor', () => {
  it('hands a repo nobody has customised the shared default', () => {
    expect(boardFor({}, 'r1')).toBe(DEFAULT_BOARD);
  });

  it('answers with the default when no repo is selected', () => {
    expect(boardFor({}, null)).toBe(DEFAULT_BOARD);
  });
});

describe('per-repository boards', () => {
  it('keeps two repositories\u2019 layouts apart', () => {
    const store = useDashboardStore.getState();
    store.removeWidget('r1', 'issues');
    store.removeWidget('r2', 'calendar');

    expect(board('r1')?.layout.map((i) => i.i)).not.toContain('issues');
    expect(board('r1')?.layout.map((i) => i.i)).toContain('calendar');
    expect(board('r2')?.layout.map((i) => i.i)).toContain('issues');
    expect(board('r2')?.layout.map((i) => i.i)).not.toContain('calendar');
  });

  it('materialises the default before editing rather than starting empty', () => {
    useDashboardStore.getState().removeWidget('r1', 'runs');
    expect(board('r1')?.layout).toHaveLength(DEFAULT_LAYOUT.length - 1);
  });
});

describe('addWidget', () => {
  it('puts a re-added widget below everything already on the board', () => {
    const store = useDashboardStore.getState();
    store.removeWidget('r1', 'calendar');
    const bottomBefore = (board('r1')?.layout ?? []).reduce(
      (max, item) => Math.max(max, item.y + item.h),
      0,
    );

    useDashboardStore.getState().addWidget('r1', 'calendar');
    const added = board('r1')?.layout.find((item) => item.i === 'calendar');
    expect(added?.y).toBe(bottomBefore);
    expect(added?.x).toBe(0);
  });

  it('is a no-op for a widget already on the board', () => {
    // Otherwise the same tile would appear twice, with two React keys of the
    // same value.
    const store = useDashboardStore.getState();
    store.addWidget('r1', 'calendar');
    store.addWidget('r1', 'calendar');
    expect(board('r1')?.layout.filter((item) => item.i === 'calendar')).toHaveLength(1);
  });

  it('gives the re-added widget its default size back', () => {
    const store = useDashboardStore.getState();
    store.removeWidget('r1', 'health');
    useDashboardStore.getState().addWidget('r1', 'health');
    const spec = DEFAULT_LAYOUT.find((item) => item.i === 'health');
    const added = board('r1')?.layout.find((item) => item.i === 'health');
    expect(added?.w).toBe(spec?.w);
    expect(added?.h).toBe(spec?.h);
  });
});

describe('moveWidget', () => {
  it('swaps a tile with the one before it in reading order', () => {
    const ordered = inReadingOrder(DEFAULT_LAYOUT);
    const first = ordered[0];
    const second = ordered[1];
    if (!first || !second) throw new Error('the default board needs at least two tiles');

    useDashboardStore.getState().moveWidget('r1', second.i, -1);
    const after = board('r1')?.layout ?? [];
    expect(after.find((item) => item.i === second.i)).toMatchObject({ x: first.x, y: first.y });
    expect(after.find((item) => item.i === first.i)).toMatchObject({ x: second.x, y: second.y });
  });

  it('does nothing at either end', () => {
    const ordered = inReadingOrder(DEFAULT_LAYOUT);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (!first || !last) throw new Error('the default board needs tiles');

    const store = useDashboardStore.getState();
    store.moveWidget('r1', first.i, -1);
    store.moveWidget('r1', last.i, 1);
    expect(inReadingOrder(board('r1')?.layout ?? [])).toEqual(ordered);
  });

  it('ignores a widget that is not on the board', () => {
    // Reachable from a menu built against a stale board — the item is gone,
    // the click is not, and it must not shuffle whatever tile now sits where
    // the missing one used to.
    useDashboardStore.getState().removeWidget('r1', 'issues');
    const before = inReadingOrder(board('r1')?.layout ?? []);

    useDashboardStore.getState().moveWidget('r1', 'issues', -1);
    expect(inReadingOrder(board('r1')?.layout ?? [])).toEqual(before);
  });
});

describe('the author filter and the window', () => {
  it('persists per repository', () => {
    const store = useDashboardStore.getState();
    store.setAuthors('r1', ['ada@example.com']);
    store.setWindow('r1', '1y');

    expect(board('r1')?.authors).toEqual(['ada@example.com']);
    expect(board('r1')?.window).toBe('1y');
    expect(boardFor(useDashboardStore.getState().boards, 'r2').authors).toEqual([]);
  });
});

describe('resetLayout', () => {
  it('restores the default board', () => {
    const store = useDashboardStore.getState();
    store.removeWidget('r1', 'calendar');
    store.removeWidget('r1', 'health');
    useDashboardStore.getState().resetLayout('r1');
    expect(board('r1')?.layout).toEqual(DEFAULT_LAYOUT);
  });

  it('leaves the window and the author filter alone', () => {
    /*
      Reset LAYOUT means the boxes, not the numbers. Throwing away the author
      filter would make it a button that silently changes what the board says
      as well as how it is arranged.
    */
    const store = useDashboardStore.getState();
    store.setAuthors('r1', ['ada@example.com']);
    store.setWindow('r1', '30d');
    useDashboardStore.getState().resetLayout('r1');

    expect(board('r1')?.authors).toEqual(['ada@example.com']);
    expect(board('r1')?.window).toBe('30d');
  });
});

describe('setLayout', () => {
  it('records what a drag produced', () => {
    useDashboardStore.getState().setLayout('r1', [{ i: 'calendar', x: 3, y: 4, w: 5, h: 6 }]);
    expect(board('r1')?.layout).toContainEqual({ i: 'calendar', x: 3, y: 4, w: 5, h: 6 });
  });

  it('keeps widgets the grid did not report — the loading-remotes case', () => {
    /*
      The bug this exists for: the board renders only the widgets a repository
      can populate, and `hasForge` is false while the remotes query is in
      flight. The grid's first onLayoutChange therefore reports the stats
      widgets ALONE. A replace would take that as the whole truth and delete the
      three forge tiles a frame before the remotes arrived to say they belonged
      — and nothing would ever put them back, because the layout would no longer
      name them.
    */
    const statsOnly = DEFAULT_LAYOUT.filter(
      (item) => item.i !== 'pulls' && item.i !== 'issues' && item.i !== 'runs',
    );
    useDashboardStore.getState().setLayout('r1', statsOnly);

    const ids = (board('r1')?.layout ?? []).map((item) => item.i);
    expect(ids).toContain('pulls');
    expect(ids).toContain('issues');
    expect(ids).toContain('runs');
    expect(board('r1')?.layout).toHaveLength(DEFAULT_LAYOUT.length);
  });

  it('still lets a removed widget stay removed', () => {
    // The merge must not resurrect a deliberate removal: removeWidget takes it
    // out of the stored layout, so there is nothing left for a later report to
    // be merged against.
    const store = useDashboardStore.getState();
    store.removeWidget('r1', 'health');
    const remaining = (board('r1')?.layout ?? []).map((item) => ({ ...item }));

    useDashboardStore.getState().setLayout('r1', remaining);
    expect((board('r1')?.layout ?? []).map((item) => item.i)).not.toContain('health');
  });
});
