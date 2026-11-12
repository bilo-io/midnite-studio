import type { HealthProfile } from '@midnite/studio-shared';

/** Body-mass index, kg / m². */
export const bmi = (weightKg: number, heightCm: number): number => weightKg / (heightCm / 100) ** 2;

export type BmiBand = 'under' | 'healthy' | 'over' | 'obese';

/** WHO cut-offs: under 18.5, healthy to 25, over to 30, obese above. */
export function bmiBand(value: number): BmiBand {
  if (value < 18.5) return 'under';
  if (value < 25) return 'healthy';
  if (value < 30) return 'over';
  return 'obese';
}

/** Whole years from a birth year — year precision on purpose (Decision 4). */
export const ageFrom = (birthYear: number, year: number): number => year - birthYear;

/** Mifflin–St Jeor's sex constant; "unspecified" takes the midpoint of the two (Decision 4). */
const SEX_CONSTANT = { male: 5, female: -161, unspecified: -78 } as const;

/** Mifflin–St Jeor basal metabolic rate: `10·kg + 6.25·cm − 5·age + s`, in kcal/day. */
export function bmrMifflin(i: { weightKg: number; heightCm: number; age: number; sex: HealthProfile['sex'] }): number {
  return 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.age + SEX_CONSTANT[i.sex];
}

export const ACTIVITY_FACTOR = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, 'very-active': 1.9 } as const;

/** Total daily energy expenditure. */
export const tdee = (bmr: number, activity: HealthProfile['activity']): number => bmr * ACTIVITY_FACTOR[activity];

const GOAL_DELTA = { lose: -500, maintain: 0, gain: 300 } as const;

/** The estimate never proposes less than this (Decision 11). */
export const KCAL_FLOOR = 1200;

export type KcalTarget = { kcal: number; source: 'override' | 'estimate'; floored: boolean };
export type TargetMissing = { missing: ('weight' | 'height' | 'birthYear')[] };

/**
 * The daily calorie target. A user's own override wins; otherwise TDEE plus the goal's delta, rounded to
 * 10 and floored at {@link KCAL_FLOOR}. Missing inputs are named rather than guessed.
 */
export function kcalTarget(profile: HealthProfile | null | undefined, latestWeightKg: number | undefined, year: number): KcalTarget | TargetMissing {
  if (profile?.kcalTargetOverride !== undefined) return { kcal: profile.kcalTargetOverride, source: 'override', floored: false };
  const missing: TargetMissing['missing'] = [];
  if (latestWeightKg === undefined) missing.push('weight');
  if (profile?.heightCm === undefined) missing.push('height');
  if (profile?.birthYear === undefined) missing.push('birthYear');
  if (missing.length > 0 || profile === null || profile === undefined) return { missing };
  const bmr = bmrMifflin({ weightKg: latestWeightKg!, heightCm: profile.heightCm!, age: ageFrom(profile.birthYear!, year), sex: profile.sex });
  const raw = Math.round((tdee(bmr, profile.activity) + GOAL_DELTA[profile.goal]) / 10) * 10;
  return raw < KCAL_FLOOR ? { kcal: KCAL_FLOOR, source: 'estimate', floored: true } : { kcal: raw, source: 'estimate', floored: false };
}

export const hasTarget = (t: KcalTarget | TargetMissing): t is KcalTarget => 'kcal' in t;
