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

  it('marks exactly op-progress and in-progress as live', () => {
    const liveIds = STATUS_SEGMENTS.filter((s) => s.live).map((s) => s.id);
    expect(new Set(liveIds)).toEqual(new Set(['op-progress', 'in-progress']));
  });
});
