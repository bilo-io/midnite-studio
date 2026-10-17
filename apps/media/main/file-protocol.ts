import { pathToFileURL } from 'node:url';

import { LIBRARY_FILE_HOST, MSTUDIO_FILE_SCHEME } from '@midnite/studio-shared';

/**
 * Media's `mstudio-file://` handler (Phase 113 Theme R). The Library addresses a file as
 * `mstudio-file://library/<rootId>/<path>` (`libraryFileUrl`), as it does in Studio, and only that
 * host is served: the resolver is the library's own (`libraryFileResolver`), which answers an indexed
 * item or its art through the runtime's path jail and `null` for anything else — a `..`, a symlink out
 * of a root, a file the index does not hold. Any other host, or a null answer, is a 404.
 */
export async function resolveMediaFileUrl(
  rawUrl: string,
  resolveLibrary: (rawUrl: string) => Promise<string | null>,
): Promise<string | null> {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== `${MSTUDIO_FILE_SCHEME}:` || url.hostname !== LIBRARY_FILE_HOST) return null;
    return await resolveLibrary(rawUrl);
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

export function installMediaFileProtocol(
  el: ProtocolElectron,
  resolveLibrary: (rawUrl: string) => Promise<string | null>,
): void {
  el.handle(MSTUDIO_FILE_SCHEME, async (request) => {
    const target = await resolveMediaFileUrl(request.url, resolveLibrary);
    if (!target) return new Response('not found', { status: 404 });
    return el.fetchFile(pathToFileURL(target).toString(), request.headers);
  });
}
