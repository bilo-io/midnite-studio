import { z } from 'zod';

/**
 * The onboarding kit's plan/apply contract (Phase 49 Theme B).
 *
 * `templates/midnite/` (Theme A) is the checked-in tree; this module is the
 * shape a *plan against it* travels in, and the manifest shape that makes a
 * second run an upgrade rather than a guess. `shared` describes the plan — it
 * carries no file contents and no filesystem access, zod only, matching every
 * other domain module in this package.
 */

/**
 * Where one template entry stands against a target repo.
 *
 * - `create`         — absent on disk.
 * - `unchanged`       — hash matches BOTH the manifest and the current
 *   template, so the target already has exactly this file.
 * - `stale`          — hash matches the manifest but not the current
 *   template: the kit moved on since this repo last ran Setup. The upgrade
 *   case.
 * - `locally-edited` — present, and its hash matches neither. Never written —
 *   see `ScaffoldPlan`'s own doc comment. A `.midnite/` with no manifest at
 *   all classifies every one of its files as `locally-edited`, wholesale:
 *   absence of provenance is not permission to overwrite.
 */
export const SCAFFOLD_STATUSES = ['create', 'unchanged', 'stale', 'locally-edited'] as const;
export const ScaffoldStatusSchema = z.enum(SCAFFOLD_STATUSES);
export type ScaffoldStatus = z.infer<typeof ScaffoldStatusSchema>;

/** One template file, resolved against one target repo. */
export const ScaffoldEntrySchema = z.object({
  /** POSIX-relative to both the template root and the target repo root. */
  path: z.string().min(1),
  status: ScaffoldStatusSchema,
  /** The TEMPLATE file's size — what would land on disk, not what is there now. */
  bytes: z.number().int().nonnegative(),
});
export type ScaffoldEntry = z.infer<typeof ScaffoldEntrySchema>;

/**
 * A full comparison of the template tree against one target repo, at one
 * moment. Nothing here has been written — `entries` is read-only information
 * the Setup dialog renders, and `locally-edited` rows are never sent back for
 * apply: the dialog excludes them from the write, visibly, rather than
 * offering an override. There is no per-file merge; a locally-edited file is
 * reported, never three-way merged.
 */
export const ScaffoldPlanSchema = z.object({
  targetRoot: z.string().min(1),
  /** The template version this plan was computed against — see the manifest. */
  templateVersion: z.string().min(1),
  entries: z.array(ScaffoldEntrySchema),
});
export type ScaffoldPlan = z.infer<typeof ScaffoldPlanSchema>;

/**
 * What actually happened, per requested path.
 *
 * `written` and `skipped` are the only two outcomes here — `locally-edited`
 * rows were never in `paths` to begin with, so there is no "refused" arm on
 * this side of the wire; the dialog's own refused count comes straight from
 * the plan it already has. `skipped` is the seconds-old-plan race: apply
 * re-hashes each target immediately before writing, and a file that changed
 * underneath the approved plan is skipped and reported rather than
 * overwritten or aborting the rest of the batch.
 */
export const ScaffoldApplyResultSchema = z.object({
  written: z.array(z.string()),
  skipped: z.array(z.object({ path: z.string(), reason: z.string() })),
});
export type ScaffoldApplyResult = z.infer<typeof ScaffoldApplyResultSchema>;

/**
 * `.midnite/settings.json`'s shape once Setup has run.
 *
 * Written LAST, after every file it describes — a crash mid-apply then
 * leaves a target whose next plan reads the truth off disk rather than off a
 * manifest that over-claims. `files` is keyed by the same POSIX-relative path
 * `ScaffoldEntry.path` uses, so a plan can look a path up in the manifest
 * directly. The per-file hash is what actually decides each row's status; the
 * top-level `template.version` exists only so the dialog can say "kit v1 →
 * v2" — a template edited without a version bump still classifies correctly
 * off the hashes alone.
 */
export const ScaffoldManifestSchema = z.object({
  version: z.literal(1),
  template: z.object({
    version: z.string().min(1),
    files: z.record(z.string(), z.string().min(1)),
  }),
});
export type ScaffoldManifest = z.infer<typeof ScaffoldManifestSchema>;
