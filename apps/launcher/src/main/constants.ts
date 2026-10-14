import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Where Midnite Studio is published and installed — the same constants
 * `packages/website/public/install.sh` uses, because the launcher's Install is
 * that script's steps done in-process (`install.ts`).
 */

export const RELEASES_REPO = 'bilo-io/midnite-apps';
export const STUDIO_FEED_URL = `https://raw.githubusercontent.com/${RELEASES_REPO}/main/midnite-studio/version.json`;
export const STUDIO_BUNDLE = 'Midnite Studio.app';
export const STUDIO_EXE = 'Midnite Studio';
export const INSTALL_DIR = '/Applications';

/** Where an existing copy may live, in the order it is looked for. */
export function studioSearchPaths(home: string = homedir()): string[] {
  return [join(INSTALL_DIR, STUDIO_BUNDLE), join(home, 'Applications', STUDIO_BUNDLE)];
}

/** The release asset — namespaced tag, arm64 zip, exactly as install.sh builds it. */
export function studioZipUrl(version: string): string {
  return `https://github.com/${RELEASES_REPO}/releases/download/midnite-studio/v${version}/midnite-studio-${version}-arm64.zip`;
}

/** The Electron framework binary is ~150 MB; anything under 100 MB is a truncated copy (install.sh's guard). */
export const MIN_FRAMEWORK_BYTES = 100 * 1024 * 1024;

export const SITE_URL = 'https://midnite-studio-website.vercel.app';
export const GITHUB_URL = `https://github.com/${RELEASES_REPO}`;
export const RELEASES_URL = `https://github.com/${RELEASES_REPO}/releases`;
export const DOWNLOAD_URL = `${SITE_URL}/download/`;
