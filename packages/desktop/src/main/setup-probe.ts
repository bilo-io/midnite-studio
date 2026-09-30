import { homedir } from 'node:os';
import { join } from 'node:path';

import { setupItem, type SetupItem, type SetupProbeResult, type ToolchainBinary } from '@midnite/studio-shared';

import { probeBinary } from './system-health';

/**
 * The setup overlay's catalogue-driven probe (Phase 98 Theme D).
 *
 * `probeBinary` (`system-health.ts`) already does the work — known paths, then
 * `which`, then a version call, each bounded. This is the thin layer that
 * drives it from `SETUP_CATALOGUE` instead of a hand-written list, so a tool a
 * later theme appends to the catalogue is probed with no main-side change.
 * `readSystemHealth` keeps its own list and is untouched.
 */

type ProbeFn = (bin: string, paths: string[], versionArg: string) => Promise<ToolchainBinary>;

/** `~/x` → `<home>/x`; anything else is already absolute (the catalogue schema allows nothing else). */
export function expandProbePath(path: string, home: string): string {
  return path.startsWith('~/') ? join(home, path.slice(2)) : path;
}

/**
 * The first non-empty line of a version call's output — `gh --version` prints
 * a release URL under its version, and `az version` a JSON document; the row
 * shows one line. `null` for no output at all.
 */
export function firstVersionLine(raw: string | null | undefined): string | null {
  if (!raw) return null;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export async function probeSetupItem(
  item: SetupItem,
  probe: ProbeFn = probeBinary,
  home: string = homedir(),
): Promise<SetupProbeResult> {
  const paths = item.probe.paths.map((path) => expandProbePath(path, home));
  const found = await probe(item.probe.bin, paths, item.probe.versionArg);
  return {
    id: item.id,
    installed: found.path !== null,
    version: firstVersionLine(found.version),
    path: found.path,
  };
}

/**
 * Probe each id the catalogue knows, in request order, deduplicated. An
 * unknown id is dropped rather than answered `installed: false` — "not a
 * tool this app knows" and "not installed" are different answers.
 */
export async function probeSetupItems(
  ids: readonly string[],
  probe: ProbeFn = probeBinary,
  home: string = homedir(),
): Promise<{ results: SetupProbeResult[] }> {
  const items = [...new Set(ids)].map(setupItem).filter((item): item is SetupItem => item !== undefined);
  const results = await Promise.all(items.map((item) => probeSetupItem(item, probe, home)));
  return { results };
}
