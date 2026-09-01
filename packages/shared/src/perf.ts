import { z } from 'zod';

/**
 * The perf-instrumentation contract — Phase 36 Theme A.
 *
 * Startup here means BOTH processes: main's boot sequence and the renderer's
 * first-interactive. Main can time itself with `performance.now()`, but the
 * renderer's marks have to cross the boundary to be read by a script watching
 * one process's output — so they travel over a one-way channel with a schema,
 * chosen over scraping `console-message` events because a wire contract is a
 * seam the next perf slice can reuse and a log-scraper is not.
 *
 * Lives outside `ipc/` on purpose: this is dev-side instrumentation, not part
 * of the product's IPC surface. The renderer sends marks only while the flag is
 * set, so in every ordinary run the channel is silent.
 */

/** Renderer → main, fire-and-forget. One mark per send. */
export const MSTUDIO_PERF_MARK = 'mstudio:perf:mark';

/**
 * `name` is capped because it is logged unsanitised and this channel is the one
 * place the renderer names its own log lines; `tMs` is renderer-relative
 * (`performance.now()`), which is what makes two marks comparable to each other
 * without agreeing on a clock with main.
 */
export const PerfMarkSchema = z.object({
  name: z.string().max(64),
  tMs: z.number(),
});

export type PerfMark = z.infer<typeof PerfMarkSchema>;

/**
 * The env flag every perf seam reads, in one place.
 *
 * Bracket access compared to `'1'` is the repo's boolean-env convention (see
 * `broker-client.ts`) — `process.env` is an index-signature type under
 * `noUncheckedIndexedAccess`, so dotted access does not typecheck.
 */
export const PERF_ENV_VAR = 'MSTUDIO_PERF';

/** Marks are emitted only when the flag is exactly `'1'` — never on `'0'`, `'true'`, or unset. */
export const perfEnabled = (env: Record<string, string | undefined>): boolean =>
  env[PERF_ENV_VAR] === '1';

/**
 * The marks `scripts/perf/startup-report.mjs` requires from a run.
 *
 * Exported rather than restated in the script so a renamed mark breaks the
 * report loudly at the same commit, instead of leaving a gap in a table nobody
 * re-reads.
 *
 * This is the order the report PRINTS them in, which since Theme B is no longer
 * the order they occur in — and deliberately so. `login-shell-done` now lands
 * after `when-ready` because the probe was taken off the boot path, and
 * `pty-ready`/`agents-listed`/`repos-restored` race by design, being three
 * concurrent chains. The list stays in the old sequence because it reads as a
 * narrative of boot; `startup-report.mjs` prints absolute milliseconds per mark
 * and never differences adjacent rows, so nothing computes a negative from it.
 * The one ordering that IS asserted is `repos-restored` before `create-window`,
 * and it is asserted explicitly rather than inferred from this array.
 */
export const BOOT_MARKS = [
  /*
    Time from process start to the point every static import in main has been
    evaluated. Added by Theme B, because it is the only number that can say
    whether deferring a handler-module group behind a dynamic import is worth
    the churn: ESM hoists imports above the importing module's own body, so the
    cost is already paid by the time the first line of `index.ts` runs, and
    `when-ready` cannot see it — Chromium's readiness dominates that mark.
  */
  'modules-loaded',
  'login-shell-done',
  'when-ready',
  'handlers-registered',
  'legacy-migrated',
  'pty-ready',
  'agents-listed',
  'repos-restored',
  'create-window',
  'ready-to-show',
] as const;

/** The renderer's three marks: it booted, it painted a view, the graph arrived. */
export const RENDERER_MARKS = ['renderer-boot', 'first-view-rendered', 'graph-first-batch'] as const;

export type BootMarkName = (typeof BOOT_MARKS)[number];
export type RendererMarkName = (typeof RENDERER_MARKS)[number];
