import { pathToFileURL } from 'node:url';

import { net, protocol } from 'electron';

import { MGIT_FILE_SCHEME } from '@midnite/git-shared';

import { confineToRoot, resolveScopeRoot, type FsScopeRequest } from './fs-scope';

/**
 * `mgit-file://<scope>/<repoId|->/<relPath>` — how media bytes reach the
 * renderer. Images, video, audio and PDFs never cross IPC as payloads; the
 * protocol streams them from disk through `net.fetch`, which keeps range
 * requests (video seeking) and backpressure for free.
 *
 * Same jail as the fs channels: scope root + `confineToRoot`, so a crafted
 * URL cannot read outside a repo checkout or `~/.claude`.
 */

/**
 * Must run before `app.whenReady` — Chromium fixes the scheme list at startup.
 * `stream` lets `<video>` seek; `supportFetchAPI` lets the renderer fetch it.
 */
export function registerMgitFileScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MGIT_FILE_SCHEME, privileges: { stream: true, supportFetchAPI: true } },
  ]);
}

/**
 * Content types Chromium needs told about. Most media sniffs fine from bytes,
 * but the PDF viewer and SVG rendering both key off the header — a `file:`
 * fetch reports `application/octet-stream` and the iframe downloads instead
 * of displaying.
 */
const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
};

/** After `whenReady`, before the window loads anything that renders media. */
export function installMgitFileProtocol(): void {
  protocol.handle(MGIT_FILE_SCHEME, async (request) => {
    const target = await resolveRequestPath(request.url);
    if (!target) return new Response('not found', { status: 404 });

    const response = await net.fetch(pathToFileURL(target).toString(), {
      headers: request.headers,
      bypassCustomProtocolHandlers: true,
    });

    const ext = target.slice(target.lastIndexOf('.') + 1).toLowerCase();
    const mime = MIME_BY_EXT[ext];
    if (!mime) return response;
    const headers = new Headers(response.headers);
    headers.set('content-type', mime);
    return new Response(response.body, { status: response.status, headers });
  });
}

/** Parse + confine. Exported for the jail tests. Fails CLOSED on anything malformed. */
export async function resolveRequestPath(rawUrl: string): Promise<string | null> {
  // One try around the whole parse: `new URL` throws on garbage and
  // `decodeURIComponent` throws on invalid percent-encoding (`%zz`), and a
  // crafted URL must land on the same null as every other jail failure.
  let scopeReq: FsScopeRequest;
  let relPath: string;
  try {
    const url = new URL(rawUrl);
    // URL lowercases the hostname; both scope names are already lowercase.
    const scope = url.hostname;
    const segments = url.pathname.split('/').filter((s) => s.length > 0);
    const repoId = segments.shift();
    if (!repoId) return null;
    relPath = segments.map((s) => decodeURIComponent(s)).join('/');

    if (scope === 'repo') {
      const worktreePath = url.searchParams.get('wt');
      scopeReq = {
        scope: 'repo',
        repoId: decodeURIComponent(repoId),
        ...(worktreePath ? { worktreePath } : {}),
      };
    } else if (scope === 'claude-home') {
      scopeReq = { scope: 'claude-home' };
    } else {
      return null;
    }
  } catch {
    return null;
  }

  const root = await resolveScopeRoot(scopeReq);
  if (!root) return null;
  return confineToRoot(root, relPath);
}
