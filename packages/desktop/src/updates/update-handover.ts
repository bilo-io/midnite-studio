/**
 * Phase 113 Theme G3 — who updates this Studio install?
 *
 * Existing installs carry a Studio-only updater that reads `midnite-studio/feed/latest-mac.yml`.
 * That feed keeps being published, so those installs keep updating onto the first suite-aware
 * Studio build — this module's build. From there the rule is Decision 6 (the launcher owns
 * updates, no app runs its own long-term):
 *
 *  - Midnite Apps installed  -> `managed`: Studio's self-updater stays off, Settings points at
 *    the launcher, which updates Studio (and the runtime) from the catalog.
 *  - Midnite Apps absent     -> `self`: Studio keeps updating from its own feed, so nobody is
 *    stranded, and Settings offers Midnite Apps once (`offerLauncher`, until dismissed).
 *
 * Pure over injected probes so it is tested in temp dirs; nothing here touches the real machine.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';

export const LAUNCHER_BUNDLE = 'Midnite Apps.app';

/** Where the launcher may live, in the order install.ts would put it. */
export function launcherSearchPaths(home: string = homedir(), installDir = '/Applications'): string[] {
  return [join(installDir, LAUNCHER_BUNDLE), join(home, 'Applications', LAUNCHER_BUNDLE)];
}

export type UpdateOwner = 'managed' | 'self';

export type HandoverDecision = {
  owner: UpdateOwner;
  /** Where the launcher bundle was found, when managed. */
  launcherPath: string | null;
  /** Show the one-time "install Midnite Apps" prompt. */
  offerLauncher: boolean;
};

export type HandoverProbes = {
  /** True when a launcher bundle exists at this path. */
  exists: (path: string) => boolean;
  searchPaths: readonly string[];
  /** The user already dismissed the one-time prompt. */
  offerDismissed: boolean;
};

export function decideUpdateOwner(probes: HandoverProbes): HandoverDecision {
  const launcherPath = probes.searchPaths.find((p) => probes.exists(p)) ?? null;
  if (launcherPath) return { owner: 'managed', launcherPath, offerLauncher: false };
  return { owner: 'self', launcherPath: null, offerLauncher: !probes.offerDismissed };
}
