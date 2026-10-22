/**
 * Seeds the mock bridge's Media pages from the real projects under the repo's
 * `.midnite/media/<tab>/`, and serves their bytes.
 *
 * - `mediaFilesFrom` walks a project folder into the mock's `media.files`
 *   shape (`'<tab>:<project>'` → path → text). Text files carry their real
 *   content; binaries a short placeholder (the renderer reads them by URL).
 * - `serveMediaFiles` answers `mstudio-file://repo/<id>/<relPath>` from disk.
 *   An `<img>`/`<audio>` on that scheme reaches `page.route` directly; `fetch`
 *   and XHR refuse an unknown scheme, so an init script rewrites those to a
 *   same-origin `/__capfile/<relPath>` path that the same route answers.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { Page } from '@playwright/test';

export const REPO_ROOT = path.resolve(__dirname, '../../../../../../..');
export const MEDIA_ROOT = path.join(REPO_ROOT, '.midnite/media');

const TEXT = /\.(md|json|txt|obj|mtl|csv|yml|yaml|html|svg|geojson|tmj|tsj)$/i;

/** Walk `<MEDIA_ROOT>/<tab>/<project>` → `{ '<tab>:<project>': { rel: content } }`. */
export function mediaFilesFrom(
  tab: string,
  project: string,
  opts: { skip?: RegExp; maxTextBytes?: number; only?: (rel: string) => boolean; as?: string; edit?: (rel: string, text: string) => string } = {},
): Record<string, Record<string, string>> {
  const base = path.join(MEDIA_ROOT, tab, project);
  const out: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.DS_Store') continue;
      const abs = path.join(dir, entry.name);
      const rel = path.relative(base, abs).split(path.sep).join('/');
      if (opts.skip?.test(rel)) continue;
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (opts.only && !opts.only(rel)) continue;
      const size = fs.statSync(abs).size;
      const text = TEXT.test(entry.name) && size <= (opts.maxTextBytes ?? 2_000_000) ? fs.readFileSync(abs, 'utf8') : 'x'.repeat(Math.min(64, size));
      out[rel] = opts.edit ? opts.edit(rel, text) : text;
    }
  };
  walk(base);
  return { [`${tab}:${opts.as ?? project}`]: out };
}

/* Map tiles: main's own handler, fed by node's fetch, with a disk cache under frames/_tiles. */
let handler: ((url: string) => Promise<Response>) | null = null;
function tileHandler(): (url: string) => Promise<Response> {
  if (handler) return handler;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createTileHandler } = require('../../../../../../../packages/features/media-map/main/map/tile-protocol') as {
    createTileHandler: (deps: unknown) => (url: string) => Promise<Response>;
  };
  const cacheDir = path.join(__dirname, '../frames/_tiles');
  fs.mkdirSync(cacheDir, { recursive: true });
  handler = createTileHandler({
    readKey: async () => null,
    fetcher: {
      fetch: async (key: string, url: string) => {
        const file = path.join(cacheDir, key.replace(/[^a-zA-Z0-9._-]+/g, '_'));
        if (fs.existsSync(file)) return { ok: true, bytes: new Uint8Array(fs.readFileSync(file)) };
        let last: { ok: false; status: number | string; message: string } = { ok: false, status: 'offline', message: '' };
        for (let attempt = 0; attempt < 4; attempt += 1) {
          try {
            const r = await fetch(url, { headers: { 'user-agent': 'MidniteStudio/0.0.4' } });
            if (r.status === 404) return { ok: false, status: 404, message: r.statusText };
            if (!r.ok) {
              last = { ok: false, status: r.status, message: r.statusText };
            } else {
              const bytes = new Uint8Array(await r.arrayBuffer());
              fs.writeFileSync(file, bytes);
              return { ok: true, bytes };
            }
          } catch (e) {
            last = { ok: false, status: 'offline', message: String(e) };
          }
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        }
        return last;
      },
    },
  });
  return handler;
}

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mid: 'audio/midi', mp4: 'video/mp4', webm: 'video/webm',
  json: 'application/json', md: 'text/markdown', txt: 'text/plain', glb: 'model/gltf-binary', obj: 'text/plain', mtl: 'text/plain',
};

function rewriteScheme(): void {
  const origin = location.origin;
  const fix = (u: unknown): unknown => {
    if (typeof u !== 'string') return u;
    if (u.startsWith('mstudio-tile://')) return `${origin}/__captile/${u.slice('mstudio-tile://'.length)}`;
    if (!u.startsWith('mstudio-file://repo/')) return u;
    const rest = u.slice('mstudio-file://repo/'.length);
    const i = rest.indexOf('/');
    return `${origin}/__capfile/${rest.slice(i + 1)}`;
  };
  // maplibre fetches tiles from a blob worker, which an init script never reaches:
  // start every worker with the same fetch rewrite, then load its real script.
  const OrigWorker = window.Worker;
  const prelude = (o: string): void => {
    const f = self.fetch.bind(self);
    const fx = (u: string): string =>
      u.startsWith('mstudio-tile://') ? `${o}/__captile/${u.slice(15)}` : u.startsWith('mstudio-file://repo/') ? `${o}/__capfile/${u.slice(20).replace(/^[^/]*\//, '')}` : u;
    self.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === 'string') return f(fx(input), init);
      if (input instanceof URL) return f(fx(input.href), init);
      if (input instanceof Request && /^mstudio-/.test(input.url)) return f(new Request(fx(input.url), input), init);
      return f(input, init);
    }) as typeof fetch;
  };
  window.Worker = function (this: unknown, url: string | URL, options?: WorkerOptions) {
    const abs = new URL(String(url), location.href).href;
    if (options?.type === 'module') return new OrigWorker(url, options);
    const src = `(${prelude.toString()})(${JSON.stringify(origin)});importScripts(${JSON.stringify(abs)});`;
    return new OrigWorker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), options);
  } as unknown as typeof Worker;
  window.Worker.prototype = OrigWorker.prototype;
  const origFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') return origFetch(fix(input) as string, init);
    if (input instanceof URL) return origFetch(fix(input.href) as string, init);
    if (input instanceof Request && /^mstudio-/.test(input.url)) return origFetch(new Request(fix(input.url) as string, input), init);
    return origFetch(input, init);
  }) as typeof window.fetch;
  // An <img crossorigin> on a custom scheme fails CORS outright, so point media elements at the same origin too.
  for (const proto of [HTMLImageElement.prototype, HTMLMediaElement.prototype, HTMLSourceElement.prototype]) {
    const desc = Object.getOwnPropertyDescriptor(proto, 'src');
    if (!desc?.set) continue;
    Object.defineProperty(proto, 'src', {
      ...desc,
      set(this: HTMLElement, v: string) {
        desc.set!.call(this, fix(v) as string);
      },
    });
  }
  const setAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
    return setAttr.call(this, name, name === 'src' || name === 'href' ? (fix(value) as string) : value);
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    const u = typeof url === 'string' ? url : url.href;
    return (open as (...a: unknown[]) => void).call(this, method, fix(u), ...rest);
  } as typeof XMLHttpRequest.prototype.open;
}

/** Project folders shown under another name (`.midnite/media/<tab>/<shown>/` → `<real>/`). */
const aliases: [string, string][] = [];

function fileFor(rel: string): string | null {
  let clean = decodeURIComponent(rel.split('?')[0]!);
  for (const [from, to] of aliases) if (clean.startsWith(from)) clean = to + clean.slice(from.length);
  const abs = path.resolve(REPO_ROOT, clean);
  if (!abs.startsWith(REPO_ROOT)) return null;
  return fs.existsSync(abs) && fs.statSync(abs).isFile() ? abs : null;
}

/** Serve `mstudio-file://repo/<id>/…` (and its `/__capfile/` rewrite) from the repo on disk. */
export async function serveMediaFiles(page: Page, opts: { log?: boolean; alias?: Record<string, string> } = {}): Promise<void> {
  for (const [from, to] of Object.entries(opts.alias ?? {})) aliases.push([from, to]);
  await page.addInitScript(rewriteScheme);
  const answer = async (route: import('@playwright/test').Route, rel: string): Promise<void> => {
    const abs = fileFor(rel);
    if (opts.log) console.log(`[capfile] ${abs ? 'ok ' : '404'} ${rel.slice(0, 140)}`);
    if (!abs) return route.fulfill({ status: 404, body: '' });
    const ext = path.extname(abs).slice(1).toLowerCase();
    return route.fulfill({
      status: 200,
      body: fs.readFileSync(abs),
      headers: { 'content-type': MIME[ext] ?? 'application/octet-stream', 'access-control-allow-origin': '*', 'cache-control': 'max-age=3600' },
    });
  };
  await page.route(/^mstudio-file:\/\/repo\//, (route) => {
    const rest = route.request().url().slice('mstudio-file://repo/'.length);
    return answer(route, rest.slice(rest.indexOf('/') + 1));
  });
  await page.route(/(^mstudio-tile:|\/__captile\/)/, async (route) => {
    const u = route.request().url();
    const res = await tileHandler()(u.startsWith('mstudio-tile:') ? u : `mstudio-tile://${u.slice(u.indexOf('/__captile/') + '/__captile/'.length)}`);
    const body = Buffer.from(await res.arrayBuffer());
    if (opts.log) console.log(`[captile] ${res.status} ${u.slice(0, 140)}`);
    return route.fulfill({ status: res.status, body, headers: Object.fromEntries(res.headers.entries()) });
  });
  await page.route(/\/__capfile\//, (route) => {
    const u = route.request().url();
    return answer(route, u.slice(u.indexOf('/__capfile/') + '/__capfile/'.length));
  });
}
