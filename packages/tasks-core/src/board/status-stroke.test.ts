import type { ForgeProjectField } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { issueItem } from './__fixtures__/project-item';
import {
  findStatusField,
  itemStatusStroke,
  STATUS_STROKE_BLOCKED_OPACITY,
  STATUS_STROKE_TABLE,
  STATUS_STROKE_WIDTH,
  statusKind,
  statusStroke,
  type StatusKind,
} from './status-stroke';

const statusField: ForgeProjectField = {
  id: 'f-status',
  name: 'Status',
  dataType: 'single_select',
  options: [
    { id: 'o-todo', name: 'Todo', color: 'GRAY' },
    { id: 'o-prog', name: 'In Progress', color: 'YELLOW' },
    { id: 'o-rev', name: 'In Review', color: 'PURPLE' },
    { id: 'o-done', name: 'Done', color: 'GREEN' },
    { id: 'o-blocked', name: 'Blocked', color: '' },
  ],
};

function withStatus(optionId: string, name = '') {
  return issueItem({
    fieldValues: { 'f-status': { fieldId: 'f-status', dataType: 'single_select', optionId, name } },
  });
}

describe('statusKind', () => {
  it.each<[string, StatusKind]>([
    ['Todo', 'todo'],
    ['To do', 'todo'],
    ['TODO', 'todo'],
    ['In Progress', 'inProgress'],
    ['in-progress', 'inProgress'],
    ['Doing', 'inProgress'],
    ['In Review', 'inReview'],
    ['  in_review ', 'inReview'],
    ['Review', 'inReview'],
    ['Done', 'done'],
    ['Closed', 'done'],
    ['Backlog', 'other'],
    ['Blocked', 'other'],
    ['', 'other'],
  ])('%j → %s', (name, kind) => {
    expect(statusKind(name)).toBe(kind);
  });
});

describe('STATUS_STROKE_TABLE', () => {
  it('Todo and In Review are dashed and marching', () => {
    for (const kind of ['todo', 'inReview'] as const) {
      expect(STATUS_STROKE_TABLE[kind].dashArray).not.toBeNull();
      expect(STATUS_STROKE_TABLE[kind].animated).toBe(true);
    }
  });

  it('In Progress has its own dash pattern', () => {
    expect(STATUS_STROKE_TABLE.inProgress.dashArray).not.toBe(STATUS_STROKE_TABLE.todo.dashArray);
  });

  it('Done and any other status are solid and still', () => {
    for (const kind of ['done', 'other'] as const) {
      expect(STATUS_STROKE_TABLE[kind]).toEqual({ dashArray: null, animated: false });
    }
  });

  it('only a dashed pattern ever animates', () => {
    for (const spec of Object.values(STATUS_STROKE_TABLE)) {
      if (spec.animated) expect(spec.dashArray).not.toBeNull();
    }
  });

  // `dep-edge-dash` moves the offset by 20px per loop; a period that does not
  // divide 20 would jump at the loop point.
  it('every dash period divides the 20px keyframe distance', () => {
    for (const spec of Object.values(STATUS_STROKE_TABLE)) {
      if (!spec.dashArray) continue;
      const period = spec.dashArray
        .split(/\s+/)
        .map(Number)
        .reduce((a, b) => a + b, 0);
      expect(20 % period).toBe(0);
    }
  });
});

describe('statusStroke', () => {
  it('takes the option colour and the kind pattern', () => {
    expect(statusStroke('In Review', 'PURPLE')).toEqual({
      kind: 'inReview',
      color: '#A855F7',
      width: STATUS_STROKE_WIDTH,
      ...STATUS_STROKE_TABLE.inReview,
      blocked: false,
      opacity: 1,
    });
  });

  it('falls back to the colour by name when the option has none', () => {
    expect(statusStroke('Todo', '').color).toBe('#9CA3AF');
  });

  it('a hex option colour passes through', () => {
    expect(statusStroke('Done', '#123456').color).toBe('#123456');
  });
});

describe('statusStroke — blocked', () => {
  it.each<[string, string]>([
    ['Todo', 'GRAY'],
    ['In Progress', 'YELLOW'],
    ['In Review', 'PURPLE'],
  ])('a blocked %s keeps its colour and dash, but holds still and fades', (name, color) => {
    const open = statusStroke(name, color);
    const blocked = statusStroke(name, color, true);
    expect(open.animated).toBe(true);
    expect(blocked).toEqual({
      ...open,
      animated: false,
      blocked: true,
      opacity: STATUS_STROKE_BLOCKED_OPACITY,
    });
  });

  it('a blocked solid status stays solid and still, and fades too', () => {
    const blocked = statusStroke('Done', 'GREEN', true);
    expect(blocked).toMatchObject({ dashArray: null, animated: false, blocked: true });
    expect(blocked.opacity).toBe(STATUS_STROKE_BLOCKED_OPACITY);
  });

  it('the blocked opacity is noticeably transparent, not invisible', () => {
    expect(STATUS_STROKE_BLOCKED_OPACITY).toBeGreaterThanOrEqual(0.5);
    expect(STATUS_STROKE_BLOCKED_OPACITY).toBeLessThanOrEqual(0.6);
  });

  it('never mutates the shared table', () => {
    statusStroke('Todo', 'GRAY', true);
    expect(STATUS_STROKE_TABLE.todo.animated).toBe(true);
  });
});

describe('findStatusField', () => {
  it('finds the single-select named Status, case-insensitively', () => {
    expect(findStatusField([statusField])).toBe(statusField);
    const lower = { ...statusField, name: 'status' };
    expect(findStatusField([lower])).toBe(lower);
  });

  it('ignores a Status field that is not a single-select', () => {
    expect(findStatusField([{ id: 'x', name: 'Status', dataType: 'text' }])).toBeNull();
  });
});

describe('itemStatusStroke', () => {
  it('reads the item status and the current option colour', () => {
    const stroke = itemStatusStroke(withStatus('o-todo'), statusField);
    expect(stroke).toMatchObject({ kind: 'todo', color: '#9CA3AF', animated: true });
  });

  it('a value whose option was deleted resolves by its set-time name', () => {
    const stroke = itemStatusStroke(withStatus('o-gone', 'In Review'), statusField);
    expect(stroke).toMatchObject({ kind: 'inReview', color: '#A855F7' });
  });

  it('passes blocked through', () => {
    const stroke = itemStatusStroke(withStatus('o-todo'), statusField, true);
    expect(stroke).toMatchObject({ kind: 'todo', animated: false, blocked: true, opacity: STATUS_STROKE_BLOCKED_OPACITY });
  });

  it('is null with no Status field, no value, or no item', () => {
    expect(itemStatusStroke(withStatus('o-todo'), null)).toBeNull();
    expect(itemStatusStroke(issueItem(), statusField)).toBeNull();
    expect(itemStatusStroke(undefined, statusField)).toBeNull();
  });
});
