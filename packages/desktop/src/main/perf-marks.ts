import { perfEnabled, type BootMarkName } from '@midnite/studio-shared';

import { defaultLogger, type Logger } from './log';

/**
 * Boot timing marks for the main process — Phase 36 Theme A.
 *
 * Main's boot was never measured, so every claim about it ("the login shell is
 * slow", "restoring repos delays the window") was folklore. This is the
 * cheapest possible instrument: one log line per stage, elapsed since process
 * start, behind `MSTUDIO_PERF=1`.
 *
 * It logs through `./log`'s `defaultLogger` rather than `console` directly —
 * that file's header forbids a second log seam, and going through it means the
 * marks follow the broker log redirection for free.
 *
 * `performance.now()` in Node is milliseconds since process start, which is
 * exactly the origin the report wants and is monotonic, unlike `Date.now()`
 * differences across a suspend.
 */

/** The instrument, minus the module singleton — the seam the unit test drives. */
export function createBootMark(opts: {
  enabled: boolean;
  log: Logger;
  now: () => number;
}): (name: BootMarkName) => void {
  if (!opts.enabled) {
    // A no-op closure, not a per-call flag check: the flag cannot change after
    // module load, so an unset run pays one empty call per stage.
    return () => {};
  }
  return (name) => {
    opts.log(`[perf] main ${name} ${Math.round(opts.now())}`);
  };
}

/**
 * Mark one boot stage. No-op unless `MSTUDIO_PERF === '1'`.
 *
 * The flag is read once, at module load, so the marks cannot be turned on
 * halfway through a boot and produce a report with holes in it.
 */
export const bootMark: (name: BootMarkName) => void = createBootMark({
  enabled: perfEnabled(process.env),
  log: defaultLogger,
  now: () => performance.now(),
});
