import { describe, expect, it } from 'vitest';

import {
  HealthDaySchema,
  HealthExerciseSchema,
  HealthFoodLibrarySchema,
  HealthMonthLogSchema,
  HealthPlanIdSchema,
  HealthPlanSchema,
  HealthProfileSchema,
  HealthRequestSchema,
  healthMonthSpan,
  migrateHealthFoods,
  migrateHealthMonthLog,
  migrateHealthPlan,
  migrateHealthProfile,
} from './health';

const NOW = '2026-11-11T10:00:00.000Z';
const exercise = { id: 'x-aaaaaaaa', name: 'Squat', sets: 3, repsMin: 8, repsMax: 12, startKg: 20 };
const plan = {
  version: 1,
  id: 'plan-aaaaaaaaaaaa',
  name: 'Full body',
  createdAt: NOW,
  updatedAt: NOW,
  days: [{ id: 'd-aaaaaaaa', name: 'A', weekday: 1, exercises: [exercise] }],
};
const day = {
  weightKg: 81.3,
  meals: [{ id: 'm-aaaaaaaa', slot: 'lunch', name: 'Rice', kcal: 300 }],
  sessions: [],
};
const month = { version: 1, id: 'log-2026-11', updatedAt: NOW, days: { '2026-11-11': day } };

describe('health schemas', () => {
  it('round-trips a month log, a plan and a food library', () => {
    expect(HealthMonthLogSchema.parse(month).days['2026-11-11']?.meals[0]?.servings).toBe(1);
    expect(HealthPlanSchema.parse(plan).days[0]?.exercises[0]?.incrementKg).toBe(2.5);
    const foods = { version: 1, updatedAt: NOW, foods: [{ id: 'f-aaaaaaaa', name: 'Oats', serving: '40 g', kcal: 150 }] };
    expect(HealthFoodLibrarySchema.parse(foods).foods[0]?.proteinG).toBe(0);
  });

  it('accepts a profile with no body fields', () => {
    const p = HealthProfileSchema.parse({ version: 1, units: 'metric', updatedAt: NOW });
    expect(p.sex).toBe('unspecified');
    expect(p.goal).toBe('maintain');
    expect(p.heightCm).toBeUndefined();
  });

  it('rejects out-of-range and malformed values', () => {
    expect(HealthDaySchema.safeParse({ weightKg: 401 }).success).toBe(false);
    expect(HealthMonthLogSchema.safeParse({ ...month, days: { '2026-12-01': day } }).success).toBe(false);
    expect(HealthExerciseSchema.safeParse({ ...exercise, repsMin: 12, repsMax: 8 }).success).toBe(false);
    expect(HealthPlanIdSchema.safeParse('plan-../x').success).toBe(false);
    expect(HealthPlanIdSchema.safeParse('plan-aaaaaaaaaaaa').success).toBe(true);
  });

  it('migrates version 1 and nulls anything else', () => {
    expect(migrateHealthMonthLog(month)).not.toBeNull();
    expect(migrateHealthPlan(plan)).not.toBeNull();
    expect(migrateHealthProfile({ version: 1, units: 'metric', updatedAt: NOW })).not.toBeNull();
    for (const m of [migrateHealthProfile, migrateHealthMonthLog, migrateHealthFoods, migrateHealthPlan]) {
      expect(m({ version: 2 })).toBeNull();
      expect(m('nope')).toBeNull();
    }
  });
});

describe('HealthRequestSchema', () => {
  it('accepts every op shape', () => {
    expect(HealthRequestSchema.safeParse({ op: 'getMonths', from: '2026-01', to: '2026-12' }).success).toBe(true);
    expect(HealthRequestSchema.safeParse({ op: 'putDay', date: '2026-11-11', day }).success).toBe(true);
    expect(HealthRequestSchema.safeParse({ op: 'eraseAll' }).success).toBe(true);
  });

  it('rejects getMonths with from after to or a span over 36 months', () => {
    expect(HealthRequestSchema.safeParse({ op: 'getMonths', from: '2026-05', to: '2026-04' }).success).toBe(false);
    expect(HealthRequestSchema.safeParse({ op: 'getMonths', from: '2023-01', to: '2026-01' }).success).toBe(false);
    expect(HealthRequestSchema.safeParse({ op: 'getMonths', from: '2023-12', to: '2026-11' }).success).toBe(true);
    expect(healthMonthSpan('2025-11', '2026-11')).toBe(13);
  });

  it('rejects an unknown op', () => {
    expect(HealthRequestSchema.safeParse({ op: 'nope' }).success).toBe(false);
  });
});
