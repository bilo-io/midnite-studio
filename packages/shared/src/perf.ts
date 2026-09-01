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
 * re-reads. Order is the boot order the report prints them in.
 */
export const BOOT_MARKS = [
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
