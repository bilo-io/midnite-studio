import type { ComponentType } from 'react';

/**
 * The status bar's segment shape (Phase 123 Theme J) — the frame's, so every
 * suite app composes its bar from the same contract. Studio's list is
 * `STATUS_SEGMENTS` in `packages/app/src/features/status-bar/segments.ts`;
 * the suite-wide one is `suiteSegments` (`suite-segments.ts`).
 */
export type StatusZone = 'left' | 'center' | 'right';

/**
 * `priority` decides Theme E's overflow order within a zone; render order
 * within a zone always follows this array's order, not `priority`. Two
 * numbers doing two jobs is the trap here — kept as distinct fields rather
 * than reusing array position for both.
 */
export type StatusSegment = {
  id: string;
  zone: StatusZone;
  /**
   * Which cluster this segment belongs to. Separators are drawn wherever two
   * adjacent segments disagree about it — see
   * [`segments-groups.ts`](./segments-groups.ts) — so grouping is data here
   * rather than a hand-placed `<div>` in the middle of the array, which is what
   * the retired `right-delimiter` segment used to be.
   *
   * A group's segments must be **contiguous** in this array; `segments.test.ts`
   * asserts it, because a group resuming after another group's segment would
   * draw two separators for one logical break.
   */
  group: StatusGroup;
  priority: number;
  label: string;
  El: ComponentType;
};

/**
 * Left: the shortcut rail, then this repository's health, then what is running.
 * Right: this repository's forge verdicts, the machine's vitals, then the
 * notification controls — names for the clusters the hand-placed
 * `right-delimiter` already separated, so the right zone gains a description of
 * itself without a pixel changing.
 */
export type StatusGroup =
  | 'shortcuts'
  | 'health'
  | 'live'
  | 'progress'
  | 'repo'
  | 'machine'
  | 'alerts';
