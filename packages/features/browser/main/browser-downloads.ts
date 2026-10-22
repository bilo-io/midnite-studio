import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

import type { DownloadFileClass } from '@midnite/studio-shared';

import { decideDownload, sanitiseFilename, type OriginVerdictLevel } from './download-policy';
import { finalizeDownload, uniqueLeaf, type DownloadRecord, type QuarantineDeps } from './download-quarantine';

/**
 * The opt-in download path (Phase 117 Theme D): `will-download` while Settings ▸ Browser ▸
 * Downloads is on. Off is still `cancelDownload` (`browser-session-policy.ts`), the default.
 *
 * Order: policy (refuse / confirm / allow) → save into the quarantine folder → on completion
 * quarantine attribute, SHA-256, Gatekeeper, optional scan, ledger line. Nothing here opens a
 * file. A `confirm` pauses the item the instant it starts, so no meaningful bytes arrive before
 * the user has answered; a deny cancels it.
 */

export type DownloadsSettings = { enabled: boolean; folder: string };

export type DownloadItemFull = {
  getFilename(): string;
  getURL(): string;
  getTotalBytes(): number;
  setSavePath(path: string): void;
  pause(): void;
  resume(): void;
  cancel(): void;
  on(event: 'done', listener: (event: unknown, state: 'completed' | 'cancelled' | 'interrupted') => void): void;
};

export type DownloadHandlerDeps = {
  getSettings: () => DownloadsSettings;
  /** `~/Downloads/Midnite Quarantine`. */
  defaultFolder: string;
  quarantine: QuarantineDeps;
  /** Creates the folder (0700), synchronously. */
  ensureFolder: (folder: string) => void;
  exists: (path: string) => boolean;
  /** Theme C's verdict for the page's origin, when it lands; absent ⇒ no verdict. */
  originVerdict?: (origin: string) => OriginVerdictLevel | undefined;
  /** Ask the user. Resolves true on allow. */
  confirm: (request: { webContents: unknown; filename: string; size: number; origin: string; fileClass: DownloadFileClass }) => Promise<boolean>;
  /** The page URL the download came from (`webContents.getURL()`), used as origin and referrer. */
  pageUrlOf: (webContents: unknown) => string;
  onRefused: (webContents: unknown, filename: string, reason?: string) => void;
  onDone: (webContents: unknown, record: DownloadRecord) => void;
  log: (message: string) => void;
};

/** The configured folder: `~` expands, a relative or blank value falls back to the default. */
export function resolveQuarantineFolder(configured: string, fallback: string): string {
  const trimmed = configured.trim();
  const expanded = trimmed === '~' || trimmed.startsWith('~/') ? join(homedir(), trimmed.slice(1)) : trimmed;
  return expanded !== '' && isAbsolute(expanded) ? expanded : fallback;
}

export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

export function createDownloadHandler(deps: DownloadHandlerDeps): (item: DownloadItemFull, webContents: unknown) => void {
  return (item, webContents) => {
    const settings = deps.getSettings();
    const filename = sanitiseFilename(item.getFilename());
    if (!settings.enabled) {
      item.cancel();
      deps.onRefused(webContents, filename);
      return;
    }

    const pageUrl = deps.pageUrlOf(webContents);
    const origin = originOf(pageUrl) || originOf(item.getURL());
    const size = item.getTotalBytes();
    const decision = decideDownload({ filename, size, originVerdict: deps.originVerdict?.(origin) });
    if (decision.action === 'refuse') {
      item.cancel();
      deps.onRefused(webContents, filename, decision.reason);
      return;
    }

    const folder = resolveQuarantineFolder(settings.folder, deps.defaultFolder);
    // Electron prompts a save dialog unless the path is set synchronously, so the folder is made
    // (0700) and the path chosen right now.
    try {
      deps.ensureFolder(folder);
    } catch (e) {
      item.cancel();
      deps.onRefused(webContents, filename, 'The quarantine folder could not be created.');
      deps.log(`[browser] download setup failed: ${String(e)}`);
      return;
    }
    const leaf = uniqueLeaf(filename, (l) => deps.exists(join(folder, l)));
    const path = join(folder, leaf);
    item.setSavePath(path);
    if (decision.action === 'confirm') item.pause();

    if (decision.action === 'confirm') {
      void deps
        .confirm({ webContents, filename, size, origin, fileClass: decision.fileClass })
        .then((ok) => {
          if (ok) {
            item.resume();
          } else {
            item.cancel();
            deps.onRefused(webContents, filename, 'Declined.');
          }
        });
    }

    item.on('done', (_e, state) => {
      if (state !== 'completed') return;
      void finalizeDownload(
        { path, filename: leaf, size, origin, url: item.getURL(), referrer: pageUrl, fileClass: decision.fileClass },
        deps.quarantine,
      )
        .then((record) => deps.onDone(webContents, record))
        .catch((e) => deps.log(`[browser] download finalize failed: ${String(e)}`));
    });
  };
}
