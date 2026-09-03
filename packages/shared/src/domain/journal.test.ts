import { describe, expect, it } from 'vitest';

import {
  JOURNAL_OPS,
  type JournalOp,
  type OpJournalEntry,
  appendJournalEntry,
  computeUndoable,
  entryUndoReason,
  isUndoableOpKind,
  undoReason,
} from './journal';

/**
 * The undoability classifier is the one place in this phase where a wrong
 * answer is a data-loss bug (offering an undo that cannot work) rather than a
 * cosmetic one (hiding a button that could have worked) — see the phase doc's
 * Theme H. These tests exist to pin the exact set down, not just smoke-test
 * that the function runs.
 */
const UNDOABLE_KINDS: readonly JournalOp[] = [
  'commit',
  'reset',
  'checkout',
  'branch-create',
  'branch-delete',
  'branch-rename',
  'stash-push',
  'stash-drop',
];

const UN_UNDOABLE_KINDS: readonly JournalOp[] = JOURNAL_OPS.filter(
  (op) => !UNDOABLE_KINDS.includes(op),
);

describe('isUndoableOpKind', () => {
  it('covers every JournalOp value', () => {
    expect(new Set([...UNDOABLE_KINDS, ...UN_UNDOABLE_KINDS])).toEqual(new Set(JOURNAL_OPS));
  });

  it('is true for exactly the ref-shaped ops', () => {
    for (const op of UNDOABLE_KINDS) {
      expect(isUndoableOpKind(op), `expected ${op} to be undoable`).toBe(true);
    }
  });

  it('is false for the sequencer ops, push, discard, and everything index-only', () => {
    for (const op of UN_UNDOABLE_KINDS) {
      expect(isUndoableOpKind(op), `expected ${op} to be un-undoable`).toBe(false);
    }
  });
});

describe('undoReason', () => {
  it('is undefined for every undoable-in-principle op', () => {
    for (const op of UNDOABLE_KINDS) {
      expect(undoReason(op)).toBeUndefined();
    }
  });

  it('gives a non-empty, distinct-enough reason for every un-undoable op', () => {
    for (const op of UN_UNDOABLE_KINDS) {
      const reason = undoReason(op);
      expect(reason, `expected a reason for ${op}`).toBeTruthy();
      expect(reason!.length).toBeGreaterThan(10);
    }
  });

  it('groups the sequencer ops under the same "deliberate reset" framing', () => {
    for (const op of ['merge', 'rebase', 'cherry-pick', 'revert'] as const) {
      expect(undoReason(op)).toMatch(/deliberate reset/);
    }
  });
});

describe('computeUndoable', () => {
  it('is false for an un-undoable op regardless of what anchor is present', () => {
    expect(computeUndoable('merge', { headBefore: 'a'.repeat(40), refBefore: 'refs/heads/main' })).toBe(
      false,
    );
  });

  it('requires headBefore for the ordinary ref-shaped ops', () => {
    expect(computeUndoable('commit', { headBefore: 'a'.repeat(40), refBefore: 'HEAD' })).toBe(true);
    expect(computeUndoable('commit', { headBefore: null, refBefore: 'HEAD' })).toBe(false);
    expect(computeUndoable('reset', { headBefore: null, refBefore: 'HEAD' })).toBe(false);
    expect(
      computeUndoable('branch-delete', { headBefore: 'a'.repeat(40), refBefore: 'refs/heads/x' }),
    ).toBe(true);
    expect(computeUndoable('branch-delete', { headBefore: null, refBefore: 'refs/heads/x' })).toBe(
      false,
    );
    expect(
      computeUndoable('stash-drop', { headBefore: 'a'.repeat(40), refBefore: null }),
    ).toBe(true);
    expect(computeUndoable('stash-drop', { headBefore: null, refBefore: null })).toBe(false);
  });

  it('requires refBefore, not headBefore, for branch-create — the branch did not exist before', () => {
    expect(computeUndoable('branch-create', { headBefore: null, refBefore: 'refs/heads/x' })).toBe(
      true,
    );
    expect(computeUndoable('branch-create', { headBefore: null, refBefore: null })).toBe(false);
  });

  it('needs neither anchor for stash-push — undone by popping the newest entry', () => {
    expect(computeUndoable('stash-push', { headBefore: null, refBefore: null })).toBe(true);
  });

  it('requires both refBefore and headAfter for branch-rename — a plain rename moves no sha', () => {
    expect(
      computeUndoable('branch-rename', {
        headBefore: null,
        refBefore: 'refs/heads/old-name',
        headAfter: 'new-name',
      }),
    ).toBe(true);
    expect(
      computeUndoable('branch-rename', { headBefore: null, refBefore: null, headAfter: 'new-name' }),
    ).toBe(false);
    expect(
      computeUndoable('branch-rename', { headBefore: null, refBefore: 'refs/heads/old-name' }),
    ).toBe(false);
  });
});

describe('entryUndoReason', () => {
  it('is undefined once an entry is marked undoable', () => {
    expect(entryUndoReason({ op: 'commit', undoable: true })).toBeUndefined();
  });

  it('falls back to the op-kind reason for an un-undoable-by-kind entry', () => {
    expect(entryUndoReason({ op: 'merge', undoable: false })).toMatch(/deliberate reset/);
  });

  it('gives a generic "anchor not captured" reason for an in-principle-undoable op that lost its anchor', () => {
    expect(entryUndoReason({ op: 'commit', undoable: false })).toMatch(/did not capture/);
  });
});

describe('appendJournalEntry', () => {
  const entry = (id: string, at: number): OpJournalEntry => ({
    id,
    repoId: 'repo-1',
    op: 'commit',
    label: `commit ${id}`,
    at,
    headBefore: 'a'.repeat(40),
    headAfter: 'b'.repeat(40),
    refBefore: 'HEAD',
    undoable: true,
  });

  it('prepends the new entry, newest first', () => {
    const first = appendJournalEntry([], entry('1', 1));
    const second = appendJournalEntry(first, entry('2', 2));
    expect(second.map((e) => e.id)).toEqual(['2', '1']);
  });

  it('evicts the oldest entries once the cap is exceeded', () => {
    let entries: OpJournalEntry[] = [];
    for (let i = 0; i < 5; i++) {
      entries = appendJournalEntry(entries, entry(String(i), i), 3);
    }
    expect(entries.map((e) => e.id)).toEqual(['4', '3', '2']);
    expect(entries).toHaveLength(3);
  });

  it('a cap of zero keeps nothing', () => {
    expect(appendJournalEntry([], entry('1', 1), 0)).toEqual([]);
  });
});
