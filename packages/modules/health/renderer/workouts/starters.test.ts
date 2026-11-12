import { describe, expect, it } from 'vitest';

import { HealthPlanSchema } from '@midnite/studio-shared';

import { STARTERS, blankPlan, duplicatePlan, planFromStarter } from './starters';

describe('starters', () => {
  it.each(STARTERS)('$name parses with HealthPlanSchema', (starter) => {
    expect(HealthPlanSchema.safeParse(planFromStarter(starter)).success).toBe(true);
  });
  it('every starter puts at most one day on a weekday', () => {
    for (const s of STARTERS) {
      const days = s.days.map((d) => d.weekday);
      expect(new Set(days).size).toBe(days.length);
    }
  });
  it('full body is Mon/Wed/Fri', () => {
    expect(planFromStarter(STARTERS[0]!).days.map((d) => d.weekday)).toEqual([1, 3, 5]);
  });
  it('a copy and a blank plan are valid with fresh ids', () => {
    const plan = planFromStarter(STARTERS[0]!);
    const copy = duplicatePlan(plan);
    expect(copy.id).not.toBe(plan.id);
    expect(copy.days[0]!.exercises[0]!.id).not.toBe(plan.days[0]!.exercises[0]!.id);
    expect(HealthPlanSchema.safeParse(copy).success).toBe(true);
    expect(HealthPlanSchema.safeParse(blankPlan()).success).toBe(true);
  });
});
