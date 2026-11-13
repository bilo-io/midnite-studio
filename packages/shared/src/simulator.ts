/**
 * Simulator scenarios (Phase 127 Theme F) — a saved sandbox: its kind, seed, parameters and an optional
 * state snapshot, one JSON file per scenario.
 *
 * One IPC channel carries every op (`SimulatorRequestSchema`, the `science` shape), each answering the
 * `GitOpResult` envelope. The scenario id is the file name, so its regex is the path jail. `params` and
 * `state` are opaque here: the module's renderer validates them per kind when a scenario is loaded.
 *
 * Imports `zod` and nothing else: this is the wire contract.
 */
import { z } from 'zod';

export const SimScenarioIdSchema = z.string().regex(/^sim-[a-z0-9]{12}$/);
export type SimScenarioId = z.infer<typeof SimScenarioIdSchema>;

export const SIM_KINDS = ['life', 'elementary', 'nbody', 'boids', 'predprey'] as const;
export const SimKindSchema = z.enum(SIM_KINDS);
export type SimKind = z.infer<typeof SimKindSchema>;

/** Longest serialised scenario the store writes. */
export const SIM_SCENARIO_MAX_BYTES = 8 * 1024 * 1024;

const TitleSchema = z.string().min(1).max(200);

export const SimScenarioSchema = z.object({
  version: z.literal(1),
  id: SimScenarioIdSchema,
  kind: SimKindSchema,
  title: TitleSchema,
  seed: z.number().int(),
  params: z.record(z.string(), z.unknown()),
  state: z.unknown().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SimScenario = z.infer<typeof SimScenarioSchema>;

/** What a caller saves: the scenario without its id and timestamps. */
export const SimScenarioDraftSchema = z.object({
  kind: SimKindSchema,
  title: TitleSchema,
  seed: z.number().int(),
  params: z.record(z.string(), z.unknown()),
  state: z.unknown().optional(),
});
export type SimScenarioDraft = z.infer<typeof SimScenarioDraftSchema>;

export const SimScenarioSummarySchema = z.object({
  id: SimScenarioIdSchema,
  kind: SimKindSchema,
  title: z.string(),
  updatedAt: z.string(),
});
export type SimScenarioSummary = z.infer<typeof SimScenarioSummarySchema>;

/** Reads a stored scenario: `version: 1` parses as-is, anything else is `null` and the store quarantines it. */
export function migrateSimScenario(raw: unknown): SimScenario | null {
  const parsed = SimScenarioSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export const SimulatorRequestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('list'), kind: SimKindSchema.optional() }),
  z.object({ op: z.literal('read'), id: SimScenarioIdSchema }),
  /** Without `id` a new scenario; with one, that scenario is overwritten (its `createdAt` kept). */
  z.object({ op: z.literal('save'), id: SimScenarioIdSchema.optional(), scenario: SimScenarioDraftSchema }),
  z.object({ op: z.literal('rename'), id: SimScenarioIdSchema, title: TitleSchema }),
  z.object({ op: z.literal('remove'), id: SimScenarioIdSchema }),
]);
export type SimulatorRequest = z.infer<typeof SimulatorRequestSchema>;
