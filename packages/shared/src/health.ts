/**
 * Health (Phase 128) — profile, body measurements, meals, workouts and plans, stored as private local JSON.
 *
 * One IPC channel carries every op (`HealthRequestSchema`, the `science` shape), each answering the
 * `GitOpResult` envelope. Every stored quantity is metric (Decision 3); a day is a local calendar date and a
 * month is one file (Decision 2). Imports `zod` and nothing else: this is the wire contract.
 */
import { z } from 'zod';

/** A local calendar date, `YYYY-MM-DD`. */
export const HealthDateSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
export type HealthDate = z.infer<typeof HealthDateSchema>;

/** The month file's id, `log-YYYY-MM`. */
export const HealthMonthIdSchema = z.string().regex(/^log-\d{4}-(0[1-9]|1[0-2])$/);
export type HealthMonthId = z.infer<typeof HealthMonthIdSchema>;

const HealthMonthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const HealthPlanIdSchema = z.string().regex(/^plan-[a-z0-9]{12}$/);
export type HealthPlanId = z.infer<typeof HealthPlanIdSchema>;

const shortId = (letter: string) => z.string().regex(new RegExp(`^${letter}-[a-z0-9]{8}$`));
export const HealthMealIdSchema = shortId('m');
export const HealthFoodIdSchema = shortId('f');
export type HealthFoodId = z.infer<typeof HealthFoodIdSchema>;
export const HealthPlanDayIdSchema = shortId('d');
export const HealthExerciseIdSchema = shortId('x');
export const HealthSessionIdSchema = shortId('w');

const IsoDateTimeSchema = z.string().datetime();

export const HealthProfileSchema = z.object({
  version: z.literal(1),
  units: z.enum(['metric', 'imperial']),
  sex: z.enum(['female', 'male', 'unspecified']).default('unspecified'),
  birthYear: z.number().int().min(1900).max(2100).optional(),
  heightCm: z.number().min(50).max(272).optional(),
  activity: z.enum(['sedentary', 'light', 'moderate', 'active', 'very-active']).default('sedentary'),
  goal: z.enum(['lose', 'maintain', 'gain']).default('maintain'),
  kcalTargetOverride: z.number().int().min(800).max(6000).optional(),
  updatedAt: IsoDateTimeSchema,
});
export type HealthProfile = z.infer<typeof HealthProfileSchema>;

export const HEALTH_MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type HealthMealSlot = (typeof HEALTH_MEAL_SLOTS)[number];

export const HealthMealSchema = z.object({
  id: HealthMealIdSchema,
  slot: z.enum(HEALTH_MEAL_SLOTS),
  name: z.string().min(1).max(120),
  kcal: z.number().int().min(0).max(10_000),
  proteinG: z.number().min(0).max(1000).optional(),
  carbsG: z.number().min(0).max(1000).optional(),
  fatG: z.number().min(0).max(1000).optional(),
  foodId: HealthFoodIdSchema.optional(),
  servings: z.number().min(0.1).max(50).default(1),
});
export type HealthMeal = z.infer<typeof HealthMealSchema>;

export const HealthSetSchema = z.object({
  reps: z.number().int().min(0).max(100),
  kg: z.number().min(0).max(1000),
});
export type HealthSet = z.infer<typeof HealthSetSchema>;

export const HealthSessionSchema = z.object({
  id: HealthSessionIdSchema,
  planId: HealthPlanIdSchema,
  planDayId: HealthPlanDayIdSchema,
  exercises: z
    .array(
      z.object({
        exerciseId: HealthExerciseIdSchema,
        name: z.string().max(80),
        sets: z.array(HealthSetSchema).max(10),
      }),
    )
    .max(20),
  minutes: z.number().int().min(0).max(600).optional(),
});
export type HealthSession = z.infer<typeof HealthSessionSchema>;

export const HealthDaySchema = z.object({
  weightKg: z.number().min(20).max(400).optional(),
  bodyFatPct: z.number().min(2).max(70).optional(),
  waistCm: z.number().min(30).max(250).optional(),
  restingHr: z.number().int().min(25).max(220).optional(),
  sleepHours: z.number().min(0).max(24).optional(),
  note: z.string().max(500).optional(),
  meals: z.array(HealthMealSchema).max(60).default([]),
  sessions: z.array(HealthSessionSchema).max(10).default([]),
});
export type HealthDay = z.infer<typeof HealthDaySchema>;

export const HealthMonthLogSchema = z
  .object({
    version: z.literal(1),
    id: HealthMonthIdSchema,
    updatedAt: IsoDateTimeSchema,
    days: z.record(HealthDateSchema, HealthDaySchema),
  })
  .refine((log) => Object.keys(log.days).every((d) => d.startsWith(log.id.slice('log-'.length))), {
    message: 'a day key must start with the month id',
  });
export type HealthMonthLog = z.infer<typeof HealthMonthLogSchema>;

export const HealthFoodSchema = z.object({
  id: HealthFoodIdSchema,
  name: z.string().min(1).max(120),
  serving: z.string().max(40),
  kcal: z.number().int().min(0).max(10_000),
  proteinG: z.number().min(0).max(1000).default(0),
  carbsG: z.number().min(0).max(1000).default(0),
  fatG: z.number().min(0).max(1000).default(0),
});
export type HealthFood = z.infer<typeof HealthFoodSchema>;

export const HealthFoodLibrarySchema = z.object({
  version: z.literal(1),
  updatedAt: IsoDateTimeSchema,
  foods: z.array(HealthFoodSchema).max(2000),
});
export type HealthFoodLibrary = z.infer<typeof HealthFoodLibrarySchema>;

export const HealthExerciseSchema = z
  .object({
    id: HealthExerciseIdSchema,
    name: z.string().min(1).max(80),
    sets: z.number().int().min(1).max(10),
    repsMin: z.number().int().min(1).max(100),
    repsMax: z.number().int().min(1).max(100),
    startKg: z.number().min(0).max(1000),
    incrementKg: z.number().min(0).max(50).default(2.5),
    deloadPct: z.number().min(0).max(50).default(10),
  })
  .refine((e) => e.repsMax >= e.repsMin, { message: 'repsMax must be at least repsMin' });
export type HealthExercise = z.infer<typeof HealthExerciseSchema>;

export const HealthPlanSchema = z.object({
  version: z.literal(1),
  id: HealthPlanIdSchema,
  name: z.string().min(1).max(80),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  days: z
    .array(
      z.object({
        id: HealthPlanDayIdSchema,
        name: z.string().max(40),
        /** ISO weekday, 1 = Monday. */
        weekday: z.number().int().min(1).max(7).optional(),
        exercises: z.array(HealthExerciseSchema).max(20),
      }),
    )
    .min(1)
    .max(7),
});
export type HealthPlan = z.infer<typeof HealthPlanSchema>;

/** The most months one `getMonths` may span: a year of trends is 13 small files. */
export const HEALTH_MAX_MONTH_SPAN = 36;

/** Months from `from` to `to` inclusive (`YYYY-MM`). */
export function healthMonthSpan(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm) + 1;
}

export const HealthRequestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('getProfile') }),
  z.object({ op: z.literal('putProfile'), profile: HealthProfileSchema }),
  z.object({
    op: z.literal('getMonths'),
    from: HealthMonthKeySchema,
    to: HealthMonthKeySchema,
  }).refine((r) => r.from <= r.to && healthMonthSpan(r.from, r.to) <= HEALTH_MAX_MONTH_SPAN, {
    message: 'from must not follow to, and the span is at most 36 months',
  }),
  z.object({ op: z.literal('putDay'), date: HealthDateSchema, day: HealthDaySchema }),
  z.object({ op: z.literal('getFoods') }),
  z.object({ op: z.literal('upsertFood'), food: HealthFoodSchema }),
  z.object({ op: z.literal('removeFood'), id: HealthFoodIdSchema }),
  z.object({ op: z.literal('listPlans') }),
  z.object({ op: z.literal('writePlan'), plan: HealthPlanSchema }),
  z.object({ op: z.literal('removePlan'), id: HealthPlanIdSchema }),
  z.object({ op: z.literal('exportAll') }),
  z.object({ op: z.literal('eraseAll') }),
]);
export type HealthRequest = z.infer<typeof HealthRequestSchema>;

/** `version: 1` parses; anything else is `null`, so a v2 adds an arm rather than a seam. */
function migrator<S extends z.ZodTypeAny>(schema: S) {
  return (raw: unknown): z.infer<S> | null => {
    const parsed = schema.safeParse(raw);
    return parsed.success ? (parsed.data as z.infer<S>) : null;
  };
}
export const migrateHealthProfile = migrator(HealthProfileSchema) as (raw: unknown) => HealthProfile | null;
export const migrateHealthMonthLog = migrator(HealthMonthLogSchema) as (raw: unknown) => HealthMonthLog | null;
export const migrateHealthFoods = migrator(HealthFoodLibrarySchema) as (raw: unknown) => HealthFoodLibrary | null;
export const migrateHealthPlan = migrator(HealthPlanSchema) as (raw: unknown) => HealthPlan | null;
