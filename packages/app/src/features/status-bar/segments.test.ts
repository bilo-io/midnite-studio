import { describe, expect, it } from 'vitest';

import { STATUS_SEGMENTS, type StatusZone } from './segments';

const zones: StatusZone[] = ['left', 'center', 'right'];

describe('STATUS_SEGMENTS', () => {
  it('has unique ids', () => {
    const ids = STATUS_SEGMENTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique priorities within each zone', () => {
    for (const zone of zones) {
      const priorities = STATUS_SEGMENTS.filter((s) => s.zone === zone).map((s) => s.priority);
      expect(new Set(priorities).size).toBe(priorities.length);
    }
  });

  it('every entry has an El', () => {
    for (const segment of STATUS_SEGMENTS) {
      expect(segment.El).toBeDefined();
    }
  });

  it('every entry declares a group', () => {
    for (const segment of STATUS_SEGMENTS) {
      expect(segment.group).toBeTruthy();
    }
  });

  /**
   * `withSeparators` emits a rule wherever two ADJACENT segments disagree about
   * their group, so a group that resumes after another group's segment would
   * draw two rules for one logical break. Contiguity is the registry's job to
   * keep; this is the assertion that notices when a new entry is dropped in the
   * wrong place.
   */
  it('keeps each group contiguous within its zone', () => {
    for (const zone of zones) {
      const groups = STATUS_SEGMENTS.filter((s) => s.zone === zone).map((s) => s.group);
      const runs = groups.filter((g, i) => g !== groups[i - 1]);
      expect(new Set(runs).size).toBe(runs.length);
    }
  });

  /**
   * Render order and collapse order must agree. Before Phase 39
   * `browser-toggle` sat at priority 5 — the lowest in the left zone — so it
   * rendered first and would have been the first segment shed on a narrow
   * window, which is the opposite of what a leftmost control should do.
   */
  it('orders priorities ascending with render order in every zone', () => {
    for (const zone of zones) {
      const priorities = STATUS_SEGMENTS.filter((s) => s.zone === zone).map((s) => s.priority);
      expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
    }
  });
});
