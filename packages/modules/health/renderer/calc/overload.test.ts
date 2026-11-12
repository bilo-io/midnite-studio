import { describe, expect, it } from 'vitest';

import type { HealthExercise } from '@midnite/studio-shared';

import { nextPrescription, prescriptionLine } from './overload';

const ex: HealthExercise = { id: 'x-aaaaaaaa', name: 'Squat', sets: 3, repsMin: 8, repsMax: 12, startKg: 20, incrementKg: 2.5, deloadPct: 10 };
const session = (date: string, kg: number, ...reps: number[]) => ({ date, sets: reps.map((r) => ({ reps: r, kg })) });

describe('nextPrescription', () => {
  it('starts at the start weight and the bottom of the range', () => {
    expect(nextPrescription(ex, [])).toEqual({ kg: 20, repsTarget: 8, reason: 'start' });
  });
  it('increases when every set reaches the top', () => {
    expect(nextPrescription(ex, [session('2026-11-01', 60, 12, 12, 12)])).toEqual({ kg: 62.5, repsTarget: 8, reason: 'increase', fromKg: 60 });
  });
  it('deloads after two sessions with a set under the floor', () => {
    const p = nextPrescription(ex, [session('2026-11-01', 60, 8, 8, 6), session('2026-11-04', 60, 8, 7, 6)]);
    expect(p).toMatchObject({ kg: 54, repsTarget: 8, reason: 'deload', fromKg: 60 });
  });
  it('rounds a deload down to the nearest half kilo', () => {
    // 62.5 x 0.9 = 56.25 -> 56
    const p = nextPrescription(ex, [session('2026-11-01', 62.5, 6, 8, 8), session('2026-11-04', 62.5, 8, 6, 8)]);
    expect(p.kg).toBe(56);
  });
  it('holds after one bad session and aims one rep above the weakest set', () => {
    const p = nextPrescription(ex, [session('2026-11-01', 60, 8, 8, 8), session('2026-11-04', 60, 10, 9, 6)]);
    expect(p).toMatchObject({ kg: 60, reason: 'hold', repsTarget: 8 });
  });
  it('holds with a partial session: 2 of 3 sets at 12 never increases', () => {
    const p = nextPrescription(ex, [session('2026-11-01', 60, 12, 12)]);
    expect(p).toMatchObject({ kg: 60, reason: 'hold', repsTarget: 12 });
  });
  it('a zero increment never raises the weight', () => {
    const p = nextPrescription({ ...ex, incrementKg: 0 }, [session('2026-11-01', 60, 12, 12, 12)]);
    expect(p.kg).toBe(60);
    expect(p.reason).toBe('hold');
  });
  it('a deload never goes below zero', () => {
    const p = nextPrescription({ ...ex, startKg: 0, deloadPct: 50 }, [session('a', 0, 1, 1, 1), session('b', 0, 1, 1, 1)]);
    expect(p.kg).toBe(0);
  });
  it('uses the most common weight as the working weight', () => {
    const p = nextPrescription(ex, [{ date: 'a', sets: [{ reps: 12, kg: 40 }, { reps: 12, kg: 60 }, { reps: 12, kg: 60 }, { reps: 12, kg: 60 }] }]);
    expect(p.fromKg).toBe(60);
  });
});

describe('prescriptionLine', () => {
  it('says where an increase came from', () => {
    expect(prescriptionLine(ex, { kg: 62.5, repsTarget: 8, reason: 'increase', fromKg: 60 })).toBe('3 × 8–12 @ 62.5 kg · up from 60');
  });
});
