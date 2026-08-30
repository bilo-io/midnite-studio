import { pathToFileURL } from 'node:url';

import { net, protocol } from 'electron';

import { readBlob } from '@midnite/studio-git-engine';
import { isSafeBlobRev, MGIT_BLOB_MAX_BYTES, MGIT_FILE_SCHEME } from '@midnite/studio-shared';

import { confineToRoot, joinWithin, resolveScopeRoot, type FsScopeRequest } from './fs-scope';

/**
 * `mgit-file://<scope>/<repoId|->/<relPath>` — how media bytes reach the
 * renderer. Images, video, audio and PDFs never cross IPC as payloads; the
 * protocol streams them from disk through `net.fetch`, which keeps range
 * requests (video seeking) and backpressure for free.
 *
 * Same jail as the fs channels: scope root + `confineToRoot`, so a crafted
 * URL cannot read outside a repo checkout or `~/.claude`.
 *
 * **Default session only.** `protocol.handle` on the module-level `protocol`
 * object registers against `session.defaultSession`, never against a named
 * partition — so a `WebContentsView` on Phase 32's `persist:browser`
 * partition (`main/browser-service.ts`) cannot resolve an `mgit-file:` URL
 * at all, and the renderer's media path stays unreachable from a remote
 * page. Phase 32 Theme B depends on that staying true; `fs-protocol.test.ts`
 * asserts it.
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
    // A `?rev=` request asks for the file as it was at a revision, which is an
    // object-database read rather than a disk read — see `resolveBlobRequest`.
    const blob = await resolveBlobRequest(request.url);
    if (blob.kind === 'invalid') return new Response('not found', { status: 404 });
    if (blob.kind === 'blob') {
      const read = await readBlob(blob.repoPath, blob.rev, blob.relPath, {
        maxBytes: MGIT_BLOB_MAX_BYTES,
      });
      if (!read.ok) {
        return new Response(read.reason, { status: read.reason === 'too-large' ? 413 : 404 });
      }
      const headers = new Headers({ 'content-length': String(read.bytes.length) });
      const blobMime = MIME_BY_EXT[extensionOf(blob.relPath)];
      if (blobMime) headers.set('content-type', blobMime);
      // A blob at a rev is immutable, so the renderer may cache it forever —
      // which is what makes flipping between before/after in the image viewer
      // instant instead of a refetch per toggle.
      headers.set('cache-control', 'public, max-age=31536000, immutable');
      return new Response(new Uint8Array(read.bytes), { status: 200, headers });
    }

    const target = await resolveRequestPath(request.url);
    if (!target) return new Response('not found', { status: 404 });

    const response = await net.fetch(pathToFileURL(target).toString(), {
      headers: request.headers,
      bypassCustomProtocolHandlers: true,
    });

    const mime = MIME_BY_EXT[extensionOf(target)];
    if (!mime) return response;
    const headers = new Headers(response.headers);
    headers.set('content-type', mime);
    /*
      Images revalidate; other media is left exactly as it was.

      A working-tree image is the "after" side of an image diff, and its URL
      does not change when the bytes on disk do — so a cached response would
      show yesterday's screenshot next to today's "before" and look like the
      diff was wrong. The narrow scope is deliberate: video and audio go
      through Chromium's range machinery, which is worth not disturbing for a
      staleness problem a file nobody re-exports mid-session does not have.
    */
    if (mime.startsWith('image/')) headers.set('cache-control', 'no-cache');
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

const extensionOf = (path: string): string => path.slice(path.lastIndexOf('.') + 1).toLowerCase();

/**
 * The `?rev=` half of the scheme: a request for a path's bytes AT A REVISION.
 *
 * Answers `none` for a plain media request so the caller falls through to the
 * disk path, and `invalid` — never `none` — for a malformed `rev` request, so a
 * crafted rev 404s instead of quietly serving the worktree file at that path.
 *
 * The jail differs in kind here: nothing is read off disk, so a symlink cannot
 * point out of the repo and `..` cannot escape it — git resolves the path
 * inside the tree it was given. What still has to hold is that the *repo* is
 * one the registry knows (`resolveScopeRoot`), that the path normalises to
 * somewhere inside it (`joinWithin`, so a `../../etc/passwd` request is refused
 * rather than quietly reaching a git-tracked file above the root), and that the
 * rev cannot be mistaken for a flag (`isSafeBlobRev`).
 *
 * Exported for the jail tests.
 */
export type BlobRequest =
  /** No `rev` — an ordinary media request, to be served off disk. */
  | { kind: 'none' }
  /** A `rev` request that failed parsing or confinement. Must 404, not fall through. */
  | { kind: 'invalid' }
  | { kind: 'blob'; repoPath: string; rev: string; relPath: string };

export async function resolveBlobRequest(rawUrl: string): Promise<BlobRequest> {
  let repoId: string;
  let relPath: string;
  let rev: string;
  let worktreePath: string | null;
  try {
    const url = new URL(rawUrl);
    const raw = url.searchParams.get('rev');
    if (raw === null) return { kind: 'none' };
    if (url.hostname !== 'repo') return { kind: 'invalid' };
    rev = raw;
    if (!isSafeBlobRev(rev)) return { kind: 'invalid' };

    const segments = url.pathname.split('/').filter((s) => s.length > 0);
    const id = segments.shift();
    if (!id) return { kind: 'invalid' };
    repoId = decodeURIComponent(id);
    relPath = segments.map((s) => decodeURIComponent(s)).join('/');
    if (relPath.length === 0) return { kind: 'invalid' };
    worktreePath = url.searchParams.get('wt');
  } catch {
    return { kind: 'invalid' };
  }

  const root = await resolveScopeRoot({
    scope: 'repo',
    repoId,
    ...(worktreePath ? { worktreePath } : {}),
  });
  if (root === null) return { kind: 'invalid' };
  if (joinWithin(root, relPath) === null) return { kind: 'invalid' };

  return { kind: 'blob', repoPath: root, rev, relPath };
}
