import { pathToFileURL } from 'node:url';

import { confineToRoot } from '@midnite/studio-runtime';
import { MSTUDIO_FILE_SCHEME } from '@midnite/studio-shared';

import { CREATOR_REPO_ID } from './context';

/**
 * Creator's `mstudio-file://` handler (Phase 113 Theme Q). The Images gallery addresses a picture
 * as `mstudio-file://repo/<repoId>/<path>` (`mstudioFileUrl`), as it does in Studio; Creator has
 * one repo id and serves it from its media root, through the runtime's path jail — a `..`, an
 * absolute path or a symlink out of the root answers 404, never a file outside it.
 */
export async function resolveCreatorFileUrl(rawUrl: string, mediaRoot: string): Promise<string | null> {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== `${MSTUDIO_FILE_SCHEME}:` || url.hostname !== 'repo') return null;
    const [repoId, ...rest] = url.pathname.split('/').filter((s) => s.length > 0).map(decodeURIComponent);
    if (repoId !== CREATOR_REPO_ID || rest.length === 0) return null;
    return await confineToRoot(mediaRoot, rest.join('/'));
  } catch {
    return null;
  }
}

/** The electron pieces the handler needs. */
export type ProtocolElectron = {
  handle: (scheme: string, handler: (request: { url: string }) => Promise<Response>) => void;
  fetchFile: (fileUrl: string) => Promise<Response>;
};

export function installCreatorFileProtocol(el: ProtocolElectron, mediaRoot: string): void {
  el.handle(MSTUDIO_FILE_SCHEME, async (request) => {
    const target = await resolveCreatorFileUrl(request.url, mediaRoot);
    if (!target) return new Response('not found', { status: 404 });
    return el.fetchFile(pathToFileURL(target).toString());
  });
}
