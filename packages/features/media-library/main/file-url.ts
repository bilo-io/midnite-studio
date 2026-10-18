import { LIBRARY_FILE_HOST } from '@midnite/studio-shared';

import type { LibraryService } from './library-service';

/**
 * The library's half of the `mstudio-file:` scheme: `mstudio-file://library/<rootId>/<relPath>` to an
 * absolute path, or null. The composer's protocol handler (Studio's `fs-protocol.ts`, Midnite Media's
 * `file-protocol.ts`) calls this for the `library` host and serves the bytes; every check — the URL's
 * shape, the index holding the path, the root's jail — happens here, so both apps refuse alike.
 */
export async function resolveLibraryFileUrl(
  service: LibraryService,
  rawUrl: string,
): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.hostname !== LIBRARY_FILE_HOST) return null;
  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
  if (segments.length < 2) return null;
  let decoded: string[];
  try {
    decoded = segments.map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
  if (
    decoded.some(
      (segment) =>
        segment === '..' ||
        segment === '.' ||
        segment.includes('/') ||
        segment.includes('\\') ||
        segment.includes('\0'),
    )
  )
    return null;
  const [rootId, ...rest] = decoded;
  if (!rootId) return null;
  return service.resolveFile(rootId, rest.join('/'));
}

/** The library's host-path resolver, in the shape the protocol handlers take. */
export const libraryFileResolver =
  (service: LibraryService) =>
  (rawUrl: string): Promise<string | null> =>
    resolveLibraryFileUrl(service, rawUrl);
