import type { HealthPlan } from '@midnite/studio-shared';

import { planId, shortId } from '../data/ids';

type StarterDay = { name: string; weekday: number; exercises: string[] };
export type Starter = { key: string; name: string; summary: string; days: StarterDay[] };

/** Three starter plans (Decision: every lift starts at an empty barbell, 3 × 8–12). */
export const STARTERS: Starter[] = [
  {
    key: 'full-body-3',
    name: 'Full body, 3 days',
    summary: 'Mon / Wed / Fri: squat, bench press, barbell row',
    days: [1, 3, 5].map((weekday, i) => ({ name: `Full body ${'ABC'[i]}`, weekday, exercises: ['Squat', 'Bench press', 'Barbell row'] })),
  },
  {
    key: 'upper-lower-4',
    name: 'Upper/lower, 4 days',
    summary: 'Mon / Tue / Thu / Fri: upper and lower, twice',
    days: [
      { name: 'Upper A', weekday: 1, exercises: ['Bench press', 'Barbell row', 'Overhead press'] },
      { name: 'Lower A', weekday: 2, exercises: ['Squat', 'Romanian deadlift', 'Calf raise'] },
      { name: 'Upper B', weekday: 4, exercises: ['Overhead press', 'Pull-up', 'Incline dumbbell press'] },
      { name: 'Lower B', weekday: 5, exercises: ['Deadlift', 'Front squat', 'Hip thrust'] },
    ],
  },
  {
    key: 'ppl-6',
    name: 'Push/pull/legs, 6 days',
    summary: 'Mon to Sat: push, pull, legs, twice',
    days: [
      { name: 'Push A', weekday: 1, exercises: ['Bench press', 'Overhead press', 'Triceps pushdown'] },
      { name: 'Pull A', weekday: 2, exercises: ['Barbell row', 'Pull-up', 'Biceps curl'] },
      { name: 'Legs A', weekday: 3, exercises: ['Squat', 'Romanian deadlift', 'Calf raise'] },
      { name: 'Push B', weekday: 4, exercises: ['Incline dumbbell press', 'Lateral raise', 'Dip'] },
      { name: 'Pull B', weekday: 5, exercises: ['Deadlift', 'Lat pulldown', 'Face pull'] },
      { name: 'Legs B', weekday: 6, exercises: ['Front squat', 'Leg press', 'Hip thrust'] },
    ],
  },
];

/** A fresh, valid plan from a starter, with new ids. */
export function planFromStarter(starter: Starter, now: Date = new Date()): HealthPlan {
  const at = now.toISOString();
  return {
    version: 1,
    id: planId(),
    name: starter.name,
    createdAt: at,
    updatedAt: at,
    days: starter.days.map((d) => ({
      id: shortId('d'),
      name: d.name,
      weekday: d.weekday,
      exercises: d.exercises.map((name) => ({ id: shortId('x'), name, sets: 3, repsMin: 8, repsMax: 12, startKg: 20, incrementKg: 2.5, deloadPct: 10 })),
    })),
  };
}

/** An empty plan with one day, for "New plan". */
export function blankPlan(now: Date = new Date()): HealthPlan {
  const at = now.toISOString();
  return { version: 1, id: planId(), name: 'New plan', createdAt: at, updatedAt: at, days: [{ id: shortId('d'), name: 'Day 1', exercises: [] }] };
}

/** A duplicate with fresh ids throughout. */
export function duplicatePlan(plan: HealthPlan, now: Date = new Date()): HealthPlan {
  const at = now.toISOString();
  return {
    ...plan,
    id: planId(),
    name: `${plan.name} copy`.slice(0, 80),
    createdAt: at,
    updatedAt: at,
    days: plan.days.map((d) => ({ ...d, id: shortId('d'), exercises: d.exercises.map((e) => ({ ...e, id: shortId('x') })) })),
  };
}
