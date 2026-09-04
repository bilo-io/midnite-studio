import { describe, expect, it } from 'vitest';

import type { BoardColumn } from './board-derive';
import {
  findCardPosition,
  flattenCardIds,
  moveHorizontal,
  moveVertical,
  nearestCardId,
  positionToItemId,
} from './board-keyboard';

const item = (id: string) => ({ id, content: { type: 'draft' as const, id: `DI_${id}`, title: id, assignees: [], body: '' }, fieldValues: {} });

function columns(spec: Record<string, string[]>): BoardColumn[] {
  return Object.entries(spec).map(([id, itemIds]) => ({
    id,
    name: id,
    color: '',
    items: itemIds.map(item),
  }));
}

describe('findCardPosition', () => {
  it('locates a card by column and row', () => {
    const cols = columns({ a: ['1', '2'], b: ['3'] });
    expect(findCardPosition(cols, '3')).toEqual({ columnIndex: 1, itemIndex: 0 });
  });

  it('is null for a card in no column', () => {
    const cols = columns({ a: ['1'] });
    expect(findCardPosition(cols, 'gone')).toBeNull();
  });
});

describe('flattenCardIds', () => {
  it('lists every card, column-then-row order', () => {
    const cols = columns({ a: ['1', '2'], b: ['3'] });
    expect(flattenCardIds(cols)).toEqual(['1', '2', '3']);
  });

  it('excludes a collapsed column entirely, not just hides its cards', () => {
    const cols = columns({ a: ['1', '2'], b: ['3'] });
    expect(flattenCardIds(cols, new Set(['a']))).toEqual(['3']);
  });
});

describe('moveVertical', () => {
  const cols = columns({ a: ['1', '2', '3'] });

  it('moves down within the column', () => {
    expect(moveVertical(cols, { columnIndex: 0, itemIndex: 0 }, 1)).toEqual({ columnIndex: 0, itemIndex: 1 });
  });

  it('clamps at the bottom rather than wrapping', () => {
    expect(moveVertical(cols, { columnIndex: 0, itemIndex: 2 }, 1)).toEqual({ columnIndex: 0, itemIndex: 2 });
  });

  it('clamps at the top rather than going negative', () => {
    expect(moveVertical(cols, { columnIndex: 0, itemIndex: 0 }, -1)).toEqual({ columnIndex: 0, itemIndex: 0 });
  });
});

describe('moveHorizontal', () => {
  it('moves to the next column, carrying the row index over', () => {
    const cols = columns({ a: ['1', '2'], b: ['3', '4'] });
    expect(moveHorizontal(cols, new Set(), { columnIndex: 0, itemIndex: 1 }, 1)).toEqual({
      columnIndex: 1,
      itemIndex: 1,
    });
  });

  it('clamps the row index when the target column is shorter', () => {
    const cols = columns({ a: ['1', '2', '3'], b: ['4'] });
    expect(moveHorizontal(cols, new Set(), { columnIndex: 0, itemIndex: 2 }, 1)).toEqual({
      columnIndex: 1,
      itemIndex: 0,
    });
  });

  it('skips a collapsed column entirely', () => {
    const cols = columns({ a: ['1'], b: ['2'], c: ['3'] });
    expect(moveHorizontal(cols, new Set(['b']), { columnIndex: 0, itemIndex: 0 }, 1)).toEqual({
      columnIndex: 2,
      itemIndex: 0,
    });
  });

  it('skips an empty column even when it is not collapsed', () => {
    const cols = columns({ a: ['1'], b: [], c: ['3'] });
    expect(moveHorizontal(cols, new Set(), { columnIndex: 0, itemIndex: 0 }, 1)).toEqual({
      columnIndex: 2,
      itemIndex: 0,
    });
  });

  it('is a no-op past the last reachable column', () => {
    const cols = columns({ a: ['1'], b: [] });
    const position = { columnIndex: 0, itemIndex: 0 };
    expect(moveHorizontal(cols, new Set(), position, 1)).toEqual(position);
  });

  it('is a no-op when every other column is collapsed or empty', () => {
    const cols = columns({ a: ['1'], b: [], c: ['3'] });
    const position = { columnIndex: 0, itemIndex: 0 };
    expect(moveHorizontal(cols, new Set(['c']), position, 1)).toEqual(position);
  });
});

describe('positionToItemId', () => {
  it('resolves a position back to the item at it', () => {
    const cols = columns({ a: ['1', '2'] });
    expect(positionToItemId(cols, { columnIndex: 0, itemIndex: 1 })).toBe('2');
  });

  it('is null for a position past the end', () => {
    const cols = columns({ a: ['1'] });
    expect(positionToItemId(cols, { columnIndex: 0, itemIndex: 5 })).toBeNull();
  });
});

describe('nearestCardId', () => {
  it('keeps the same flat index when the board is unchanged in size', () => {
    const cols = columns({ a: ['1', '2'], b: ['3'] });
    expect(nearestCardId(cols, 1)).toBe('2');
  });

  it('clamps to the last card once the board has shrunk past the old index', () => {
    const cols = columns({ a: ['1'] });
    expect(nearestCardId(cols, 5)).toBe('1');
  });

  it('is null once the board is entirely empty', () => {
    expect(nearestCardId(columns({ a: [] }), 0)).toBeNull();
  });

  it('skips a collapsed column when rescuing focus, the same as flattenCardIds', () => {
    const cols = columns({ a: ['1'], b: ['2'], c: ['3'] });
    // Index 1 in the raw list is "2" (column b) — but b just collapsed, so
    // the rescue must land in the collapse-aware list instead.
    expect(nearestCardId(cols, 1, new Set(['b']))).toBe('3');
  });
});
