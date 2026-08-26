import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { clampPercent } from './cpu';

/**
 * GPU utilisation on darwin, from the IOKit registry.
 *
 * `ioreg -c IOAccelerator` dumps the accelerator nodes, whose
 * `PerformanceStatistics` dictionary carries `"Device Utilization %"` — the
 * same counter Activity Monitor's GPU History window graphs. The registry is
 * world-readable, so this needs no privilege and raises no prompt.
 *
 * **Deliberately not `powermetrics`**, which is the other well-known route to
 * this number and needs sudo. A metric in a footer bar is not worth an
 * authorisation dialog, and a tool that fails without one would just be a
 * permanently-absent readout.
 *
 * The probe **self-disables after three consecutive failures**. Without that, a
 * machine where this cannot work — a non-darwin build, a future OS that renames
 * the key, an `ioreg` that is missing — spawns a doomed subprocess every few
 * seconds for as long as the app is open. It logs once when it gives up, so the
 * cause is discoverable without being a log flood.
 */

const exec = promisify(execFile);

/** Absolute path, for the stripped-PATH reason in ./memory.ts. */
const IOREG = '/usr/sbin/ioreg';

/** `-r -d 1 -w 0`: matching nodes only, no children, no line wrapping. */
const IOREG_ARGS = ['-r', '-d', '1', '-w', '0', '-c', 'IOAccelerator'];

const FAILURE_LIMIT = 3;

/**
 * Pull `"Device Utilization %"` out of an `ioreg` dump.
 *
 * Pure and total: unparseable output is `undefined`, never a throw and never a
 * zero. A machine with a discrete GPU alongside the integrated one prints more
 * than one accelerator node, so this takes the **highest** reading rather than
 * the first — the busy GPU is the one worth showing, and the first node in
 * registry order is not reliably it.
 */
export function parseGpuUtilization(output: string): number | undefined {
  const matches = output.matchAll(/"Device Utilization %"\s*=\s*(\d+)/g);
  let best: number | undefined;
  for (const match of matches) {
    const value = Number(match[1]);
    if (!Number.isFinite(value)) continue;
    if (best === undefined || value > best) best = value;
  }
  return best === undefined ? undefined : clampPercent(best);
}

export type GpuProbe = {
  sample: () => Promise<number | undefined>;
  /** Exposed for the test: has the probe given up? */
  readonly disabled: boolean;
};

export function createGpuProbe(
  run: () => Promise<string> = runIoreg,
  /**
   * Fires at most once per session, and it is the only trace of a probe
   * retiring itself — a silent give-up is the worse failure mode.
   */
  // eslint-disable-next-line no-console
  log: (message: string) => void = (message) => console.warn(message),
  /**
   * Injected rather than read from `process.platform` inside the closure, so
   * the failure-counting behaviour is testable on a CI runner that is not a
   * mac. `ioreg` is darwin-only, so anywhere else the probe starts retired.
   */
  platform: string = process.platform,
): GpuProbe {
  let failures = 0;
  let disabled = platform !== 'darwin';

  return {
    get disabled() {
      return disabled;
    },
    async sample() {
      if (disabled) return undefined;

      let value: number | undefined;
      try {
        value = parseGpuUtilization(await run());
      } catch {
        value = undefined;
      }

      if (value === undefined) {
        failures += 1;
        if (failures >= FAILURE_LIMIT) {
          disabled = true;
          log(
            `[metrics] GPU probe disabled after ${FAILURE_LIMIT} consecutive failures; ` +
              'the "Device Utilization %" counter is unreadable on this machine.',
          );
        }
        return undefined;
      }

      // A single good read clears the streak — a transient spawn failure under
      // load should not retire the probe for the rest of the session.
      failures = 0;
      return value;
    },
  };
}

async function runIoreg(): Promise<string> {
  const { stdout } = await exec(IOREG, IOREG_ARGS, {
    timeout: 2_000,
    // The dump is tens of KB on a machine with several accelerators; the
    // default 1 MB cap is ample, but say so rather than inherit it silently.
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout;
}
