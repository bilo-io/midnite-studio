import { describe, expect, it } from 'vitest';

import type { Milestone } from '@midnite/studio-shared';

import { atRisk, byIdMap, groupByStatus, overdue, positionInRange, timelineRange, wouldCreateCycle } from './roadmap-model';

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const m = (n: number, over: Partial<Milestone> = {}): Milestone => ({
  id: u(n), title: `M${n}`, description: '', status: 'planned', due: '2027-01-15', dependsOn: [], tags: [], ...over,
});

describe('wouldCreateCycle', () => {
  it('rejects A to B to A', () => {
    expect(wouldCreateCycle([m(1, { dependsOn: [u(2)] }), m(2)], u(2), [u(1)])).toBe(true);
  });
  it('rejects a self-dependency', () => {
    expect(wouldCreateCycle([m(1)], u(1), [u(1)])).toBe(true);
  });
  it('accepts an acyclic chain', () => {
    expect(wouldCreateCycle([m(1), m(2, { dependsOn: [u(1)] })], u(3), [u(2)])).toBe(false);
  });
});

describe('atRisk', () => {
  const dep = (status: Milestone['status'], due: string) => m(1, { status, due });
  const check = (self: Partial<Milestone>, depStatus: Milestone['status'], depDue: string) => {
    const milestones = [dep(depStatus, depDue), m(2, { dependsOn: [u(1)], due: '2027-02-01', ...self })];
    return atRisk(milestones[1]!, byIdMap(milestones));
  };
  it('is true when an unfinished dependency is due on or after this one', () => {
    expect(check({}, 'planned', '2027-02-01')).toBe(true);
    expect(check({}, 'in-progress', '2027-03-01')).toBe(true);
  });
  it('is false when the dependency is done, or due earlier', () => {
    expect(check({}, 'done', '2027-03-01')).toBe(false);
    expect(check({}, 'planned', '2027-01-31')).toBe(false);
  });
  it('is false for a milestone that is itself closed', () => {
    expect(check({ status: 'done' }, 'planned', '2027-03-01')).toBe(false);
    expect(check({ status: 'dropped' }, 'planned', '2027-03-01')).toBe(false);
  });
  it('ignores a dependency that no longer exists', () => {
    expect(atRisk(m(2, { dependsOn: [u(9)] }), byIdMap([]))).toBe(false);
  });
});

describe('overdue', () => {
  it.each([
    ['planned', '2027-01-14', true],
    ['in-progress', '2027-01-14', true],
    ['planned', '2027-01-15', false],
    ['done', '2020-01-01', false],
    ['dropped', '2020-01-01', false],
  ] as const)('%s due %s relative to 2027-01-15 is %s', (status, due, expected) => {
    expect(overdue(m(1, { status, due }), '2027-01-15')).toBe(expected);
  });
});

describe('timelineRange', () => {
  it('pads a month either side and keeps at least six', () => {
    expect(timelineRange([m(1, { due: '2027-03-10' })], '2027-01-01')).toEqual({ from: '2027-02', to: '2027-07', months: 6, later: 0 });
  });
  it('starts the earlier of start and due', () => {
    expect(timelineRange([m(1, { start: '2026-10-01', due: '2027-05-01' })], '2027-01-01')).toMatchObject({ from: '2026-09', to: '2027-06', months: 10 });
  });
  it('shows six months from today when empty', () => {
    expect(timelineRange([], '2027-01-20')).toEqual({ from: '2027-01', to: '2027-06', months: 6, later: 0 });
  });
  it('clips at 36 months and counts what is later', () => {
    const range = timelineRange([m(1, { due: '2027-01-01' }), m(2, { due: '2031-06-01' }), m(3, { due: '2032-01-01' })], '2027-01-01');
    expect(range).toEqual({ from: '2026-12', to: '2029-11', months: 36, later: 2 });
  });
});

describe('positionInRange', () => {
  it('places a date by month and day, clamped', () => {
    const range = { from: '2027-01', to: '2027-04', months: 4, later: 0 };
    expect(positionInRange('2027-01-01', range)).toBe(0);
    expect(positionInRange('2027-03-01', range)).toBe(0.5);
    expect(positionInRange('2030-01-01', range)).toBe(1);
    expect(positionInRange('2020-01-01', range)).toBe(0);
  });
});

describe('groupByStatus', () => {
  it('orders groups and sorts each by due', () => {
    const groups = groupByStatus([m(1, { due: '2027-03-01' }), m(2, { due: '2027-02-01' }), m(3, { status: 'done' })]);
    expect(groups.map((g) => g.status)).toEqual(['planned', 'done']);
    expect(groups[0]!.items.map((x) => x.title)).toEqual(['M2', 'M1']);
  });
});
