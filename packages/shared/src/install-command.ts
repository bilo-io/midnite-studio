/**
 * The one-line installer command, spelled once for both surfaces that show it.
 *
 * The public site's download page prints it for a visitor to paste into a
 * terminal, and the app's "Update Midnite Studio" action types it into the
 * integrated terminal for anyone not sitting in this repo's own checkout. Two
 * copies of a string someone pipes into `sh` is one copy that will eventually
 * point somewhere else, so both import it from here.
 *
 * Plain strings, no zod and no other import: the website takes this file by a
 * source alias (`@midnite/studio-shared/install-command`) rather than through
 * the package barrel, so that a static marketing bundle never drags the IPC
 * schemas along with it. Keep it import-free for that reason.
 *
 * The origin is the site *root* the command curls from. The site can be built
 * for another root (`WEBSITE_ORIGIN`, see `packages/website/src/site-origin.ts`),
 * so both builders take one; the app has no such build variable and always
 * uses the default — the live deployment every published download page names.
 */

/** The public site's live root, and the default every builder below falls back to. */
export const MIDNITE_SITE_ORIGIN = 'https://midnite-apps.vercel.app';

/** The site's two installers, each a byte-for-byte copy of its upstream script. */
export type InstallerFile = 'install.sh' | 'install-studio.sh';

/**
 * `<origin>/install.sh` — the **launcher** installer (Midnite Apps), which is what the download
 * page offers; pass `'install-studio.sh'` for the Studio one the in-app update re-runs.
 */
export function installerUrl(
  origin: string = MIDNITE_SITE_ORIGIN,
  file: InstallerFile = 'install.sh',
): string {
  return `${origin.replace(/\/+$/, '')}/${file}`;
}

/** `curl -fsSL <origin>/install.sh | sh` — installs the launcher, as the download page prints it. */
export function installCommand(
  origin: string = MIDNITE_SITE_ORIGIN,
  file: InstallerFile = 'install.sh',
): string {
  return `curl -fsSL ${installerUrl(origin, file)} | sh`;
}

/**
 * The command against the live site that re-installs **Midnite Studio** — what the app's "Update
 * Midnite Studio" action runs. It stays on Studio's own script so updating Studio never swaps in the
 * launcher now that `install.sh` is the launcher's.
 */
export const MIDNITE_INSTALL_COMMAND: string = installCommand(
  MIDNITE_SITE_ORIGIN,
  'install-studio.sh',
);
