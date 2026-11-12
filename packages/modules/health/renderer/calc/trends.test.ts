import { describe, expect, it } from 'vitest';

import type { HealthMonthLog } from '@midnite/studio-shared';

import { isoWeekKey, movingAverage, weekStart, weeklyRate, weeklySummary } from './trends';

const pts = (...pairs: [string, number][]) => pairs.map(([date, value]) => ({ date, value }));

describe('movingAverage', () => {
  it('uses a calendar window, so a gap does not stretch it', () => {
    const out = movingAverage(pts(['2026-11-01', 80], ['2026-11-02', 81], ['2026-11-03', 82], ['2026-11-10', 90], ['2026-11-11', 91]), 7);
    // Nov 3 has 3 points in its window; Nov 10 and 11 hold only 2 and 3 points of Nov 5..11.
    expect(out.map((p) => p.date)).toEqual(['2026-11-03']);
    expect(out[0]!.value).toBe(81);
  });
  it('emits nothing under three points', () => expect(movingAverage(pts(['2026-11-01', 80], ['2026-11-02', 81]))).toEqual([]));
  it('drops points that left the window', () => {
    const out = movingAverage(pts(['2026-11-01', 100], ['2026-11-07', 80], ['2026-11-08', 82], ['2026-11-09', 84]), 7);
    expect(out[out.length - 1]!.value).toBe(82);
  });
});

describe('weeklyRate', () => {
  it('is -0.7 for a series falling 0.1 kg a day', () => {
    const series = Array.from({ length: 10 }, (_, i): [string, number] => [`2026-11-${String(i + 1).padStart(2, '0')}`, 80 - i * 0.1]);
    expect(weeklyRate(pts(...series))).toBeCloseTo(-0.7, 6);
  });
  it('is null under four points', () => expect(weeklyRate(pts(['2026-11-01', 80], ['2026-11-02', 79], ['2026-11-03', 78]))).toBeNull());
  it('ignores points older than the window', () => {
    const series: [string, number][] = [['2026-09-01', 120], ['2026-11-01', 80], ['2026-11-02', 80], ['2026-11-03', 80], ['2026-11-04', 80]];
    expect(weeklyRate(pts(...series))).toBeCloseTo(0, 9);
  });
});

describe('isoWeekKey', () => {
  it('names weeks Monday-start', () => {
    expect(isoWeekKey('2026-11-11')).toBe('2026-W46');
    expect(isoWeekKey('2026-11-09')).toBe('2026-W46');
    expect(isoWeekKey('2026-11-15')).toBe('2026-W46');
    expect(isoWeekKey('2026-11-16')).toBe('2026-W47');
  });
  it('rolls the year boundary by the Thursday rule', () => {
    expect(isoWeekKey('2027-01-01')).toBe('2026-W53');
    expect(isoWeekKey('2024-12-30')).toBe('2025-W01');
  });
  it('finds the Monday', () => {
    expect(weekStart('2026-11-11')).toBe('2026-11-09');
    expect(weekStart('2026-11-15')).toBe('2026-11-09');
  });
});

describe('weeklySummary', () => {
  const set = (reps: number, kg: number) => ({ reps, kg });
  const month: HealthMonthLog = {
    version: 1,
    id: 'log-2026-11',
    updatedAt: '2026-11-01T00:00:00.000Z',
    days: {
      '2026-11-09': { weightKg: 81, meals: [{ id: 'm-aaaaaaaa', slot: 'lunch', name: 'a', kcal: 2000, servings: 1 }], sessions: [{ id: 'w-aaaaaaaa', planId: 'plan-aaaaaaaaaaaa', planDayId: 'd-aaaaaaaa', exercises: [{ exerciseId: 'x-aaaaaaaa', name: 'Squat', sets: [set(10, 60), set(10, 60), set(10, 60)] }] }] },
      '2026-11-11': { weightKg: 80.7, meals: [{ id: 'm-bbbbbbbb', slot: 'lunch', name: 'b', kcal: 2210, servings: 1 }], sessions: [] },
      '2026-11-17': { weightKg: 70, meals: [], sessions: [] },
    },
  };
  it('summarises one week and ignores the others', () => {
    expect(weeklySummary([month], '2026-W46')).toEqual({ avgKcal: 2105, daysLogged: 2, sessions: 1, volumeKg: 1800, weightChangeKg: -0.3 });
  });
  it('has nulls for an empty week', () => {
    expect(weeklySummary([month], '2026-W40')).toEqual({ avgKcal: null, daysLogged: 0, sessions: 0, volumeKg: 0, weightChangeKg: null });
  });
});
