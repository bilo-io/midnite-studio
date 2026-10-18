import { pathToFileURL } from 'node:url';

import { CAPTURE_FILE_HOST, MSTUDIO_FILE_SCHEME } from '@midnite/studio-shared';

/**
 * Capture's `mstudio-file://` handler (Phase 113 Theme K). The view addresses a capture as
 * `mstudio-file://capture/captures/<name>` and a clipboard image as `…/capture/clipboard/<name>`, as it
 * does in Studio, and only that host is served: the resolver is the feature's own
 * (`captureFileResolver`), which answers only a name Capture generated, inside its own data directory.
 * Any other host, or a null answer, is a 404.
 */
export async function resolveCaptureAppFileUrl(
  rawUrl: string,
  resolveCapture: (rawUrl: string) => Promise<string | null>,
): Promise<string | null> {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== `${MSTUDIO_FILE_SCHEME}:` || url.hostname !== CAPTURE_FILE_HOST)
      return null;
    return await resolveCapture(rawUrl);
  } catch {
    return null;
  }
}

/** The electron pieces the handler needs. */
export type ProtocolElectron = {
  handle: (
    scheme: string,
    handler: (request: { url: string; headers: Headers }) => Promise<Response>,
  ) => void;
  /** `net.fetch` of a `file://` URL, forwarding the request's headers so a player's Range requests seek. */
  fetchFile: (fileUrl: string, headers: Headers) => Promise<Response>;
};

export function installCaptureFileProtocol(
  el: ProtocolElectron,
  resolveCapture: (rawUrl: string) => Promise<string | null>,
): void {
  el.handle(MSTUDIO_FILE_SCHEME, async (request) => {
    const target = await resolveCaptureAppFileUrl(request.url, resolveCapture);
    if (!target) return new Response('not found', { status: 404 });
    return el.fetchFile(pathToFileURL(target).toString(), request.headers);
  });
}
