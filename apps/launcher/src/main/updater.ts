import { spawnSync } from 'node:child_process';

import { RELEASES_REPO } from './constants';

/**
 * The suite's one updater (Phase 113 Theme E, Decision 6: "the launcher/runtime owns updates;
 * no app runs its own updater").
 *
 * The launcher is the runtime host, so it is the only process in the suite that runs
 * electron-updater. A composed app's stub runs the same Electron framework but never this
 * module — its bundle is updated *by* the launcher, from `catalog.json` (`bundles/updates.ts`),
 * and `scripts/single-updater.test.mjs` plus the `electron-updater` restriction in
 * `eslint.config.mjs` keep it that way. Studio's own updater
 * (`packages/desktop/src/main/update-service.ts`) is the one allowed exception until Theme G
 * repoints it at the runtime build; it is untouched here, so Studio keeps updating.
 *
 * Same rules as Studio's feed (CLAUDE.md, bilo-io/midnite-apps):
 *  - **`generic`, never `github`.** That repo hosts every midnite app's releases, so its
 *    `releases/latest` is whichever app shipped last — the github provider would hand the
 *    launcher another app's update.
 *  - **Namespaced.** The launcher's tags are `midnite-launcher/vX.Y.Z`, so its feed is
 *    `midnite-launcher/feed/latest-mac.yml` beside Studio's `midnite-studio/feed/`.
 */

export const LAUNCHER_FEED_URL = `https://raw.githubusercontent.com/${RELEASES_REPO}/main/midnite-launcher/feed`;

export const LAUNCHER_UPDATE_FEED = { provider: 'generic', url: LAUNCHER_FEED_URL, channel: 'latest' } as const;

/** The slice of electron-updater's `AppUpdater` this module drives — a fake in tests. */
export type UpdaterLike = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  setFeedURL(options: typeof LAUNCHER_UPDATE_FEED): void;
  checkForUpdates(): Promise<unknown>;
};

export type LauncherUpdatesDeps = {
  updater: UpdaterLike;
  isPackaged: boolean;
  /**
   * An ad-hoc-signed build cannot be updated in place — Squirrel.Mac checks the new build's
   * signature against the running one — so it only checks (as Studio's `manualInstall` does).
   */
  adHocSigned: boolean;
  /** After the runtime check: bring the installed bundles up to date (`updateInstalledBundles`). */
  updateBundles: () => Promise<void>;
  onError?: (message: string) => void;
};

export type LauncherUpdatesState = 'dev' | 'check-only' | 'auto';

/**
 * Configure and run one update pass. Returns which mode it ran in, for the caller's log and
 * for tests; never throws.
 */
export async function runLauncherUpdates(deps: LauncherUpdatesDeps): Promise<LauncherUpdatesState> {
  // A dev run is the stock Electron binary — there is nothing to update, and no app-update.yml.
  if (!deps.isPackaged) return 'dev';
  const report = (error: unknown) => deps.onError?.(error instanceof Error ? error.message : String(error));

  const { updater } = deps;
  updater.setFeedURL(LAUNCHER_UPDATE_FEED);
  // The launcher holds no unsaved work, so a verified update installs the next time it quits.
  updater.autoDownload = !deps.adHocSigned;
  updater.autoInstallOnAppQuit = !deps.adHocSigned;
  await updater.checkForUpdates().catch(report);
  await deps.updateBundles().catch(report);
  return deps.adHocSigned ? 'check-only' : 'auto';
}

/**
 * `codesign -dv` on our own executable. It reports on stderr; ad-hoc (`Signature=adhoc`), unsigned
 * (non-zero exit) or unreadable all count as ad-hoc — the safe side, where nothing auto-installs.
 */
export function isAdHocSigned(exe: string): boolean {
  const res = spawnSync('codesign', ['-dv', '--verbose=2', exe], { encoding: 'utf8' });
  if (res.status !== 0) return true;
  return `${res.stdout}${res.stderr}`.includes('Signature=adhoc');
}
