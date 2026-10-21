import { posix } from 'node:path';

import {
  GAME_SINGLE_FILE_WARN_BYTES,
  GameAssetIndexSchema,
  gameSingleFileWarning,
  isGameExportExcluded,
} from '@midnite/studio-shared';

/**
 * The single-file web export (Phase 107 Theme P, Decision 14): one `.html` that opens from `file://`
 * with no server and no bundler.
 *
 * - `scanImportSites` (compose.ts has a string-only twin) finds every module reachable from the page's module scripts; each is rewritten so
 *   its relative and import-mapped specifiers become bare `@game/<path>` specifiers, then becomes a
 *   `data:` URL behind one import map (`@game/<path>` → URL). Bare specifiers resolve through the map
 *   alone, so import cycles never need one URL to contain another.
 * - `assets/index.json` and every file it names are inlined as `window.__MIDNITE_ASSETS__`
 *   (`{ index, files }`, files keyed by repo-relative path with `data:` URL values), which the kit's
 *   asset index reads instead of fetching.
 * - Rapier's `-compat` build already embeds its wasm.
 *
 * Pure over a file reader, so it runs in tests with a map of files.
 */
export type SingleFileSource = {
  /** A repo-relative, `/`-separated file's bytes, or `null` when it does not exist. */
  read: (path: string) => Promise<Buffer | null>;
  /** Every file under a repo-relative folder (relative to the repo root), recursively. */
  list: (dir: string) => Promise<string[]>;
};

export type SingleFileResult = { html: string; bytes: number; warnings: string[] };

const MIME: Record<string, string> = {
  '.json': 'application/json',
  '.tmj': 'application/json',
  '.tsj': 'application/json',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
};

const extOf = (path: string): string => posix.extname(path).toLowerCase();
export const dataUrl = (mime: string, bytes: Uint8Array | string): string =>
  `data:${mime};base64,${(typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : Buffer.from(bytes)).toString('base64')}`;
const mimeOf = (path: string): string => MIME[extOf(path)] ?? 'application/octet-stream';
/** JSON placed inside a `<script>`: `<` can never close it. */
const safeJson = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c');

/** One specifier occurrence: where its text sits in the module source. */
export type ImportSite = { specifier: string; start: number; end: number; dynamic: boolean };

const IMPORT_PATTERNS: { re: RegExp; dynamic: boolean }[] = [
  // import a from 'x' · import { a,\n b } from 'x' · export * from 'x' · export { a } from 'x'
  { re: /(^[ \t]*(?:import|export)\b[^'"`;]*?\bfrom\s*)(['"])([^'"\n]+)\2/gm, dynamic: false },
  // import 'x'
  { re: /(^[ \t]*import\s*)(['"])([^'"\n]+)\2/gm, dynamic: false },
  // import('x')
  { re: /(\bimport\s*\(\s*)(['"])([^'"\n]+)\2/g, dynamic: true },
];

/** Every module specifier a source imports, with its position. Specifiers are literal strings only. */
export function scanImportSites(source: string): ImportSite[] {
  const sites: ImportSite[] = [];
  for (const { re, dynamic } of IMPORT_PATTERNS) {
    for (const match of source.matchAll(re)) {
      const start = (match.index ?? 0) + match[1]!.length + 1;
      sites.push({ specifier: match[3]!, start, end: start + match[3]!.length, dynamic });
    }
  }
  return sites.sort((a, b) => a.start - b.start);
}

type ImportMap = Record<string, string>;

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const LINK_RE = /<link\b[^>]*>/gi;
const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? (m[1] ?? m[2] ?? null) : null;
};

const isExternal = (spec: string): boolean => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(spec);

function normalise(path: string): string | null {
  const out = posix.normalize(path.replace(/^\/+/, ''));
  if (out === '..' || out.startsWith('../') || out === '.' || out.length === 0) return null;
  return out;
}

export async function buildSingleFile(indexHtml: string, source: SingleFileSource): Promise<SingleFileResult> {
  const warnings: string[] = [];
  const warn = (message: string): void => {
    if (!warnings.includes(message)) warnings.push(message);
  };

  // --- the page's import map and scripts ---------------------------------------
  let originalMap: ImportMap = {};
  const mapMatch = /<script\b[^>]*type\s*=\s*["']importmap["'][^>]*>([\s\S]*?)<\/script>/i.exec(indexHtml);
  if (mapMatch) {
    try {
      const parsed = JSON.parse(mapMatch[1]!) as { imports?: ImportMap };
      originalMap = parsed.imports ?? {};
    } catch {
      warn('The page’s import map is not valid JSON; it was ignored.');
    }
  }

  const resolveMapped = (spec: string): string | null => {
    const exact = originalMap[spec];
    const target =
      exact ??
      Object.entries(originalMap)
        .filter(([key]) => key.endsWith('/') && spec.startsWith(key))
        .sort((a, b) => b[0].length - a[0].length)
        .map(([key, value]) => value + spec.slice(key.length))[0];
    return target === undefined ? null : normalise(posix.normalize(target));
  };

  /** A specifier seen in `importer` → the repo path it names, or `null` when it is left alone. */
  const resolve = (spec: string, importer: string): string | null => {
    if (isExternal(spec)) {
      warn(`External import left as is: ${spec}`);
      return null;
    }
    if (spec.startsWith('./') || spec.startsWith('../')) return normalise(posix.join(posix.dirname(importer), spec));
    if (spec.startsWith('/')) return normalise(spec);
    const mapped = resolveMapped(spec);
    if (mapped === null) warn(`Unresolved import left as is: ${spec}`);
    return mapped;
  };

  // --- the module graph -------------------------------------------------------
  const modules = new Map<string, { mime: string; text: string }>();
  const key = (path: string): string => `@game/${path}`;

  async function rewrite(text: string, importer: string): Promise<string> {
    const sites = scanImportSites(text);
    const queue: string[] = [];
    let out = '';
    let cursor = 0;
    for (const site of sites) {
      if (site.start < cursor) continue;
      const path = resolve(site.specifier, importer);
      if (path === null) continue;
      out += text.slice(cursor, site.start) + key(path);
      cursor = site.end;
      queue.push(path);
    }
    out += text.slice(cursor);
    for (const path of queue) await include(path);
    return out;
  }

  async function include(path: string): Promise<void> {
    if (modules.has(path)) return;
    if (isGameExportExcluded(path)) {
      warn(`An excluded file is imported: ${path}`);
      return;
    }
    const bytes = await source.read(path);
    if (bytes === null) {
      warn(`Imported file not found: ${path}`);
      return;
    }
    modules.set(path, { mime: 'text/javascript', text: '' }); // claim first: import cycles end here
    if (extOf(path) === '.json') {
      modules.set(path, { mime: 'application/json', text: bytes.toString('utf8') });
      return;
    }
    modules.set(path, { mime: 'text/javascript', text: await rewrite(bytes.toString('utf8'), path) });
  }

  // --- the HTML ---------------------------------------------------------------
  const replacements: { start: number; end: number; text: string }[] = [];
  const entries: string[] = [];
  const mapSlot: { start: number; end: number } | null = mapMatch ? { start: mapMatch.index, end: mapMatch.index + mapMatch[0].length } : null;

  for (const match of indexHtml.matchAll(SCRIPT_RE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const attrs = match[1]!;
    const type = (attr(attrs, 'type') ?? '').toLowerCase();
    if (type === 'importmap') continue;
    const src = attr(attrs, 'src');
    if (type === 'module') {
      if (src !== null) {
        const path = isExternal(src) ? null : normalise(posix.normalize(src));
        if (path === null) {
          warn(`External script left as is: ${src}`);
          continue;
        }
        await include(path);
        replacements.push({ start, end, text: `<script type="module">import ${JSON.stringify(key(path))};</script>` });
        entries.push(path);
      } else {
        const text = await rewrite(match[2]!, 'index.html');
        replacements.push({ start, end, text: `<script type="module">${text.replace(/<\/script/gi, '<\\/script')}</script>` });
      }
    } else if (src !== null && !isExternal(src)) {
      const path = normalise(posix.normalize(src));
      const bytes = path ? await source.read(path) : null;
      if (bytes === null) warn(`Script not found: ${src}`);
      else replacements.push({ start, end, text: `<script>${bytes.toString('utf8').replace(/<\/script/gi, '<\\/script')}</script>` });
    }
  }
  for (const match of indexHtml.matchAll(LINK_RE)) {
    const tag = match[0];
    const href = attr(tag, 'href');
    if (!/rel\s*=\s*["']?stylesheet/i.test(tag) || href === null || isExternal(href)) continue;
    const path = normalise(posix.normalize(href));
    const bytes = path ? await source.read(path) : null;
    if (bytes === null) warn(`Stylesheet not found: ${href}`);
    else {
      const start = match.index ?? 0;
      replacements.push({ start, end: start + tag.length, text: `<style>${bytes.toString('utf8').replace(/<\/style/gi, '<\\/style')}</style>` });
    }
  }

  // --- assets -----------------------------------------------------------------
  let indexJson: unknown = null;
  const files: Record<string, string> = {};
  const indexBytes = await source.read('assets/index.json');
  if (indexBytes !== null) {
    try {
      const parsed = GameAssetIndexSchema.safeParse(JSON.parse(indexBytes.toString('utf8')));
      if (parsed.success) {
        indexJson = parsed.data;
        for (const asset of parsed.data.assets) {
          const base = asset.path.replace(/\/+$/, '');
          const direct = await source.read(base);
          const paths = direct !== null ? [base] : await source.list(base);
          if (paths.length === 0) warn(`Asset ${asset.name} has no files at ${asset.path}.`);
          for (const path of paths) {
            if (isGameExportExcluded(path) || files[path] !== undefined) continue;
            const bytes = path === base && direct !== null ? direct : await source.read(path);
            if (bytes !== null) files[path] = dataUrl(mimeOf(path), bytes);
          }
          if (asset.kind === 'terrain') {
            warn(`Terrain ${asset.name} loads sibling files by relative path, which a single file cannot serve; use the folder or zip export for it.`);
          }
        }
      } else warn('assets/index.json is not a valid asset index; assets were not inlined.');
    } catch {
      warn('assets/index.json is not valid JSON; assets were not inlined.');
    }
  }

  // --- assemble ---------------------------------------------------------------
  const importMap: ImportMap = {};
  for (const [path, mod] of [...modules].sort((a, b) => a[0].localeCompare(b[0]))) importMap[key(path)] = dataUrl(mod.mime, mod.text);
  const head =
    `<script>window.__MIDNITE_ASSETS__ = ${safeJson({ index: indexJson, files })};</script>\n` +
    `<script type="importmap">${safeJson({ imports: importMap })}</script>`;

  if (mapSlot) replacements.push({ ...mapSlot, text: head });
  const sorted = replacements.sort((a, b) => a.start - b.start);
  let html = '';
  let cursor = 0;
  for (const r of sorted) {
    html += indexHtml.slice(cursor, r.start) + r.text;
    cursor = r.end;
  }
  html += indexHtml.slice(cursor);
  if (!mapSlot) {
    html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, () => `${head}\n</head>`) : `${head}\n${html}`;
  }

  // Scripts were rewritten in place and the map took the original map's slot (or the head's end), so it still precedes every module.
  for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']*)["']/gi)) {
    if (!m[1]!.startsWith('data:') && !m[1]!.startsWith('#')) warn(`The page still references ${m[1]}.`);
  }

  const bytes = Buffer.byteLength(html, 'utf8');
  if (bytes > GAME_SINGLE_FILE_WARN_BYTES) warnings.unshift(gameSingleFileWarning(bytes));
  return { html, bytes, warnings };
}
