// vitest/jsdom: the pure helpers behind the Tasks screens (Phase 146 H). No browser capability needed.
import { describe, expect, it } from 'vitest';
import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import { linkify } from './linkify';
import { applyMoves, columnSnapInterval, columnWidth, currentOptionId, itemRef, movableField, pageIndex, withOptionValue } from './model';
import { canSubmit } from './new-issue-screen';
import { defaultProject } from './project-picker';
import { toggle } from './list-view';

const status: ForgeProjectField = {
  id: 'f1',
  name: 'Status',
  dataType: 'single_select',
  options: [
    { id: 'o1', name: 'Todo', color: 'GRAY' },
    { id: 'o2', name: 'Done', color: 'GREEN' },
  ],
} as ForgeProjectField;
const issue = (id: string, optionId?: string): ForgeProjectItem =>
  ({
    id,
    content: { type: 'issue', id: `c-${id}`, number: 7, repo: '', title: 'T', url: '', state: 'open', assignees: [], body: '', labels: [], dependencies: { blockedBy: [], parent: null, subIssues: [] }, linkedPrs: [] },
    fieldValues: optionId ? { f1: { fieldId: 'f1', dataType: 'single_select', optionId, name: '' } } : {},
  }) as unknown as ForgeProjectItem;

describe('board geometry', () => {
  it('columns are min(88%, 340) wide and snap by column plus gap', () => {
    expect(columnWidth(390)).toBe(340);
    expect(columnWidth(300)).toBe(264);
    expect(columnSnapInterval(300, 12)).toBe(276);
  });
  it('pageIndex rounds to the nearest column and clamps', () => {
    expect(pageIndex(0, 276, 4)).toBe(0);
    expect(pageIndex(150, 276, 4)).toBe(1);
    expect(pageIndex(9999, 276, 4)).toBe(3);
    expect(pageIndex(-20, 276, 4)).toBe(0);
    expect(pageIndex(10, 276, 0)).toBe(0);
  });
});

describe('moves', () => {
  it('only a single-select grouping is movable', () => {
    expect(movableField(status)).toBe(status);
    expect(movableField({ id: 'i', name: 'Sprint', dataType: 'iteration' } as ForgeProjectField)).toBeNull();
    expect(movableField(null)).toBeNull();
  });
  it('withOptionValue and applyMoves replace the value without mutating the input', () => {
    const item = issue('a', 'o1');
    const moved = applyMoves([item, issue('b', 'o1')], status, new Map([['a', 'o2']]));
    expect(currentOptionId(moved[0]!, status)).toBe('o2');
    expect(currentOptionId(moved[1]!, status)).toBe('o1');
    expect(currentOptionId(item, status)).toBe('o1');
    expect(withOptionValue(item, status as never, 'o2').fieldValues.f1).toMatchObject({ optionId: 'o2', name: 'Done' });
  });
  it('no moves returns a copy', () => {
    const items = [issue('a')];
    expect(applyMoves(items, status, new Map())).not.toBe(items);
  });
});

describe('labels and refs', () => {
  it('itemRef is #n, or Draft', () => {
    expect(itemRef(issue('a'))).toBe('#7');
    expect(itemRef({ id: 'd', content: { type: 'draft', id: 'x', title: 't', assignees: [], body: '' }, fieldValues: {} } as ForgeProjectItem)).toBe('Draft');
  });
  it('toggle adds and removes', () => {
    expect(toggle([], 'a')).toEqual(['a']);
    expect(toggle(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('linkify', () => {
  it('marks URLs and keeps trailing punctuation outside', () => {
    expect(linkify('see https://x.dev/a?b=1, ok')).toEqual([
      { text: 'see ' },
      { text: 'https://x.dev/a?b=1', url: 'https://x.dev/a?b=1' },
      { text: ', ok' },
    ]);
    expect(linkify('plain')).toEqual([{ text: 'plain' }]);
    expect(linkify('')).toEqual([]);
  });
});

describe('project and form rules', () => {
  const p = (id: string, over: object = {}) => ({ id, number: 1, title: id, url: '', closed: false, linkedToRepo: false, ...over });
  it('opens a linked open project first, then any open one', () => {
    expect(defaultProject([p('a'), p('b', { linkedToRepo: true })])?.id).toBe('b');
    expect(defaultProject([p('a', { closed: true }), p('c')])?.id).toBe('c');
    expect(defaultProject([])).toBeNull();
  });
  it('a new issue needs a title and no write in flight', () => {
    expect(canSubmit('  ', false)).toBe(false);
    expect(canSubmit('x', true)).toBe(false);
    expect(canSubmit('x', false)).toBe(true);
  });
});
