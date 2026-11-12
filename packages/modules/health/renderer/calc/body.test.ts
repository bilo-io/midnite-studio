import { describe, expect, it } from 'vitest';

import type { HealthProfile } from '@midnite/studio-shared';

import { ageFrom, bmi, bmiBand, bmrMifflin, hasTarget, kcalTarget, tdee } from './body';

const profile = (over: Partial<HealthProfile> = {}): HealthProfile => ({
  version: 1,
  units: 'metric',
  sex: 'male',
  activity: 'sedentary',
  goal: 'maintain',
  updatedAt: '2026-11-11T00:00:00.000Z',
  ...over,
});

describe('bmi', () => {
  it('is kg over metres squared', () => expect(bmi(80, 180)).toBeCloseTo(24.69, 2));
  it('bands at the WHO cut-offs', () => {
    expect(bmiBand(18.4)).toBe('under');
    expect(bmiBand(18.5)).toBe('healthy');
    expect(bmiBand(25)).toBe('over');
    expect(bmiBand(30)).toBe('obese');
  });
});

describe('Mifflin-St Jeor', () => {
  it('worked example, male: 80 kg, 180 cm, 30 y', () => expect(bmrMifflin({ weightKg: 80, heightCm: 180, age: 30, sex: 'male' })).toBe(1780));
  it('worked example, female', () => expect(bmrMifflin({ weightKg: 80, heightCm: 180, age: 30, sex: 'female' })).toBe(1614));
  it('unspecified takes the midpoint constant', () => expect(bmrMifflin({ weightKg: 80, heightCm: 180, age: 30, sex: 'unspecified' })).toBe(1697));
  it('TDEE multiplies by the activity factor', () => expect(tdee(1780, 'moderate')).toBeCloseTo(2759, 0));
  it('age is year precision', () => expect(ageFrom(1996, 2026)).toBe(30));
});

describe('kcalTarget', () => {
  it('maintain: TDEE rounded to 10', () => {
    // BMR 1780 x 1.55 = 2759 -> 2760
    expect(kcalTarget(profile({ heightCm: 180, birthYear: 1996, activity: 'moderate' }), 80, 2026)).toEqual({ kcal: 2760, source: 'estimate', floored: false });
  });
  it('lose subtracts 500, gain adds 300', () => {
    expect(kcalTarget(profile({ heightCm: 180, birthYear: 1996, activity: 'moderate', goal: 'lose' }), 80, 2026)).toMatchObject({ kcal: 2260 });
    expect(kcalTarget(profile({ heightCm: 180, birthYear: 1996, activity: 'moderate', goal: 'gain' }), 80, 2026)).toMatchObject({ kcal: 3060 });
  });
  it('names the missing inputs', () => {
    expect(kcalTarget(profile({ birthYear: 1996 }), 80, 2026)).toEqual({ missing: ['height'] });
    expect(kcalTarget(null, undefined, 2026)).toEqual({ missing: ['weight', 'height', 'birthYear'] });
  });
  it('floors a lose target at 1200 and says so', () => {
    const t = kcalTarget(profile({ sex: 'female', heightCm: 150, birthYear: 1970, goal: 'lose' }), 45, 2026);
    expect(t).toEqual({ kcal: 1200, source: 'estimate', floored: true });
  });
  it('an override wins and is not floored', () => {
    const t = kcalTarget(profile({ kcalTargetOverride: 900 }), undefined, 2026);
    expect(t).toEqual({ kcal: 900, source: 'override', floored: false });
    expect(hasTarget(t)).toBe(true);
  });
});
