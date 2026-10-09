import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { extname, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { net } from 'electron';

import { MSTUDIO_GAME_SCHEME, type GameNetwork } from '@midnite/studio-shared';

import { confineToRoot } from '../fs-scope';

/**
 * `mstudio-game://<gameId>/<path>` — how a running game's files reach its
 * sandboxed view (Phase 107 Theme B). Served from that game's repo only.
 *
 * **Handled on the run's own session, never the default one.** Registered with
 * `ses.protocol.handle` per run, so the app's renderer and the browser's
 * partition cannot resolve a game URL, and a game cannot resolve an
 * `mstudio-file:` one. Privileges are registered once, with `mstudio-file`, by
 * `registerPrivilegedSchemes()` — Electron keeps only the last call's list.
 *
 * Every response — 200 and 404 alike — carries the CSP and `nosniff`, because
 * the handler is the one place every byte passes through; `webRequest`'s
 * `onHeadersReceived` does not reliably see custom-protocol responses.
 */

export const GAME_MIME_BY_EXT: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.tmj': 'application/json; charset=utf-8',
  '.tsj': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

/**
 * The CSP every response carries. `network: 'on'` opens https for connect, images and media.
 * `scriptHashes` are `'sha256-…'` sources for the document's own inline import maps — never
 * `'unsafe-inline'`, so any other inline script stays blocked.
 */
export function gameCsp(network: GameNetwork, scriptHashes: readonly string[] = []): string {
  const remote = network === 'on' ? ' https:' : '';
  return [
    "default-src 'self'",
    ["script-src 'self' 'wasm-unsafe-eval'", ...scriptHashes].join(' '),
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${remote}`,
    `media-src 'self' data: blob:${remote}`,
    `connect-src 'self' data: blob:${remote}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
  ].join('; ');
}

/**
 * CSP hash sources for every inline `<script type="importmap">` in `html`. An import map
 * cannot be external (Chromium ignores `src` on one), and CSP treats it as an inline
 * script — so without its hash, every bare `import 'three'` fails to resolve. The
 * hash is taken per request, so an agent's edit to the map holds on the next reload.
 */
export function importMapHashes(html: string): string[] {
  // The HTML parser folds CRLF and lone CR to LF before it sees the script's text.
  const source = html.replace(/\r\n?/g, '\n');
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  const hashes: string[] = [];
  for (const [, attrs, body] of source.matchAll(pattern)) {
    if (!/\btype\s*=\s*["']?importmap["']?(?=[\s>]|$)/i.test(attrs ?? '')) continue;
    hashes.push(`'sha256-${createHash('sha256').update(body ?? '', 'utf8').digest('base64')}'`);
  }
  return [...new Set(hashes)];
}

const baseHeaders = (network: GameNetwork, scriptHashes: readonly string[] = []): Record<string, string> => ({
  'Content-Security-Policy': gameCsp(network, scriptHashes),
  'X-Content-Type-Options': 'nosniff',
  // Hot reload: a game's files change under the view constantly.
  'Cache-Control': 'no-store',
});

const notFound = (network: GameNetwork): Response =>
  new Response('not found', { status: 404, headers: { ...baseHeaders(network), 'Content-Type': 'text/plain' } });

/**
 * Resolve a request path to a regular file inside `root`, or `null`. Rejects:
 * a NUL byte; any segment starting with `.` (covers `..`, `.git`, `.env`); a
 * symlink at ANY segment (`confineToRoot` only catches one that escapes); a
 * path that leaves the root. A directory resolves to the `index.html` in it.
 */
export async function resolveGameFile(root: string, pathname: string): Promise<string | null> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  const segments = decoded.split('/').filter((segment) => segment !== '');
  if (segments.some((segment) => segment.startsWith('.'))) return null;

  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) return null;
    } catch {
      return null;
    }
  }

  let target = current;
  try {
    const info = await lstat(target);
    if (info.isDirectory()) {
      target = join(target, 'index.html');
      if ((await lstat(target)).isSymbolicLink()) return null;
    }
    if (!(await lstat(target)).isFile()) return null;
  } catch {
    return null;
  }

  const rel = target.slice(root.length + (root.endsWith(sep) ? 0 : 1));
  const confined = await confineToRoot(root, rel);
  return confined === null ? null : target;
}

/**
 * The handler for one run. `network` is fixed for the run's lifetime (read from
 * the manifest at launch); changing it takes effect on the next run.
 */
export function gameProtocolHandler(
  root: string,
  gameId: string,
  network: GameNetwork,
): (request: Request) => Promise<Response> {
  return async (request) => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return notFound(network);
    }
    if (url.protocol !== `${MSTUDIO_GAME_SCHEME}:` || url.hostname !== gameId) return notFound(network);

    const file = await resolveGameFile(root, url.pathname);
    if (file === null) return notFound(network);

    try {
      const range = request.headers.get('range');
      const upstream = await net.fetch(pathToFileURL(file).toString(), {
        bypassCustomProtocolHandlers: true,
        ...(range ? { headers: { range } } : {}),
      });
      const contentType = GAME_MIME_BY_EXT[extname(file).toLowerCase()] ?? 'application/octet-stream';
      const scriptHashes = contentType.startsWith('text/html') ? importMapHashes(await readFile(file, 'utf8')) : [];
      const headers = new Headers(baseHeaders(network, scriptHashes));
      headers.set('Content-Type', contentType);
      for (const name of ['content-length', 'content-range', 'accept-ranges']) {
        const value = upstream.headers.get(name);
        if (value !== null) headers.set(name, value);
      }
      return new Response(upstream.body, { status: upstream.status, headers });
    } catch {
      return notFound(network);
    }
  };
}
