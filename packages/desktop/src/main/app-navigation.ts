/**
 * `will-navigate` / `will-redirect` guard for the app's own windows.
 *
 * The embedded browser partition inverts this rule (http(s) only) in
 * `browser-security.ts`; here only the bundled renderer origin may load in-place.
 */

import { shell, type WebContents } from 'electron';

function normaliseOrigin(raw: string): string {
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

export function isAppDocumentUrl(rawUrl: string, devServerOrigin: string | null): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol === 'file:' || parsed.protocol === 'mstudio-file:') return true;
  if (devServerOrigin === null) return false;
  return parsed.origin === normaliseOrigin(devServerOrigin);
}

export type AppNavigationDecision = { allowed: true } | { allowed: false; openExternal?: boolean };

export function checkAppNavigationUrl(
  rawUrl: string,
  devServerOrigin: string | null,
): AppNavigationDecision {
  if (isAppDocumentUrl(rawUrl, devServerOrigin)) return { allowed: true };
  try {
    const scheme = new URL(rawUrl).protocol;
    if (scheme === 'http:' || scheme === 'https:') return { allowed: false, openExternal: true };
  } catch {
    // fall through
  }
  return { allowed: false };
}

export function bindAppNavigationGuard(
  webContents: WebContents,
  devServerOrigin: string | null,
): void {
  const handler = (event: Electron.Event, url: string) => {
    const decision = checkAppNavigationUrl(url, devServerOrigin);
    if (decision.allowed) return;
    event.preventDefault();
    if (decision.openExternal) void shell.openExternal(url);
  };

  webContents.on('will-navigate', handler);
  webContents.on('will-redirect', handler);
}
