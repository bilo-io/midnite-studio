import { join } from 'node:path';

import { CAPTURE_FILE_HOST } from '@midnite/studio-shared';

/**
 * Capture's half of the `mstudio-file:` scheme: `mstudio-file://capture/<bucket>/<file>` to an absolute
 * path, or null. The composer's protocol handler (Studio's `fs-protocol.ts`, Midnite Capture's
 * `file-protocol.ts`) calls this for the `capture` host and serves the bytes.
 *
 * Only two shapes resolve, and only inside the two directories the service owns: a capture
 * (`captures/cap-<…>.png|webm`) and a clipboard image (`clipboard/clip-<hex>.png`). The file name has to
 * match the generated pattern exactly, so no `..`, separator or other name can reach the disk.
 */
const CAPTURE_FILE = /^cap-\d{8}-\d{6}-[0-9a-f]{6,16}\.(png|webm)$/;
const CLIPBOARD_FILE = /^clip-[0-9a-f]{6,32}\.png$/;

export type CaptureFileDirs = { captures: string; clipboard: string };

export function resolveCaptureFileUrl(dirs: CaptureFileDirs, rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.hostname !== CAPTURE_FILE_HOST) return null;
  const segments = url.pathname.split('/').filter((s) => s.length > 0);
  if (segments.length !== 2) return null;
  const [bucket, rawName] = segments as [string, string];
  let name: string;
  try {
    name = decodeURIComponent(rawName);
  } catch {
    return null;
  }
  if (bucket === 'captures' && CAPTURE_FILE.test(name)) return join(dirs.captures, name);
  if (bucket === 'clipboard' && CLIPBOARD_FILE.test(name)) return join(dirs.clipboard, name);
  return null;
}

/** The capture host's resolver, in the shape the protocol handlers take. */
export const captureFileResolver =
  (dirs: CaptureFileDirs) =>
  async (rawUrl: string): Promise<string | null> =>
    resolveCaptureFileUrl(dirs, rawUrl);
