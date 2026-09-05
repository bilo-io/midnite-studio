import { z } from 'zod';

/**
 * Schemas for the Workspace Optimizer (Phase 59) — a CleanMyMac-style
 * scan/clean/monitor surface pointed at the repos and worktrees this app
 * manages, plus one user-chosen extra root per scan, and the terminal/agent
 * processes it itself spawns. No GPU temperature field anywhere: that
 * guardrail is enforced here, exactly as `MetricSampleSchema` enforces it
 * for the footer.
 */

/**
 * What a scanned item counts as. Seeded with the three patterns
 * `classify()` (in `desktop/src/main/optimizer/scan-service.ts`) actually
 * matches today — widening this set is a later phase's decision (see the
 * phase doc's Decision 6), not this one's.
 */
export const ScanCategorySchema = z.enum([
  'nodeModules',
  'buildOutput',
  'staleWorktree',
  'looseObjects',
]);
export type ScanCategory = z.infer<typeof ScanCategorySchema>;

export const ScanItemSchema = z.object({
  path: z.string(),
  bytes: z.number().nonnegative(),
  category: ScanCategorySchema,
  /** `null` for an item under the one user-chosen extra root, not a known repo. */
  repoId: z.string().nullable(),
});
export type ScanItem = z.infer<typeof ScanItemSchema>;

/**
 * Capped at 2,000 items with `truncated: true` beyond it — a monorepo scan
 * produces thousands of paths, and this is not sent across IPC uncapped.
 */
export const SCAN_ITEMS_CAP = 2_000;

export const ScanResultSchema = z.object({
  totalBytes: z.number().nonnegative(),
  byCategory: z.record(ScanCategorySchema, z.number().nonnegative()),
  items: z.array(ScanItemSchema).max(SCAN_ITEMS_CAP),
  truncated: z.boolean(),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;

export const ProcessInfoSchema = z.object({
  pid: z.number().int().positive(),
  ppid: z.number().int().nonnegative(),
  name: z.string(),
  argv: z.string(),
  rssBytes: z.number().nonnegative(),
  cpuPercent: z.number().nonnegative(),
  /** Whether this app's own pty/agent session registry spawned it — see Decision 10. */
  ours: z.boolean(),
});
export type ProcessInfo = z.infer<typeof ProcessInfoSchema>;

/** No temperature field — settled in code since Phase 18 (`metrics/gpu.ts`). */
export const GpuStatsSchema = z.object({
  model: z.string().nullable(),
  vramBytes: z.number().nonnegative().nullable(),
  loadPercent: z.number().min(0).max(100).nullable(),
});
export type GpuStats = z.infer<typeof GpuStatsSchema>;

/**
 * The envelope every optimizer op returns, modelled on `GitOpResultOf`
 * (`domain/result.ts`) minus the `conflict` arm, which is git-specific.
 * Do not "fix" this back to `GitOpResult` — the optimizer surface has no
 * concept of a merge conflict.
 */
export type OptimizerResultOf<T> = { ok: true; value: T } | { ok: false; message: string };

export const OptimizerResultOf = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([
    z.object({ ok: z.literal(true), value: schema }),
    z.object({ ok: z.literal(false), message: z.string() }),
  ]);

/** The void-value case — `killProcess`'s own return shape. */
export const OptimizerVoidResultSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), message: z.string() }),
]);
export type OptimizerVoidResult = z.infer<typeof OptimizerVoidResultSchema>;
