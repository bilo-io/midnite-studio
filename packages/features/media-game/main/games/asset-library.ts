import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, extname, isAbsolute, join, relative, sep } from 'node:path';

import {
  DEFAULT_ASSET_LIBRARY_ROOT,
  GAME_LIBRARY_PREVIEW_MAX_BYTES,
  GameLibraryAssetKindSchema,
  type GameLibraryAsset,
  type GameLibraryAssetKind,
  type GameLibraryCollection,
  type GameLibraryFile,
  type GameLibraryListing,
} from '@midnite/studio-shared';

/**
 * The shared asset library (read-only): a root folder with one folder per collection, each with an
 * optional `catalog.json`. Everything here is plain node and never throws across the boundary —
 * callers get a listing, or a `{ok:false}` from {@link readLibraryFile}.
 */

/** `~` and `~/x` expand against the home directory; everything else is used as given. */
export function expandLibraryRoot(root: string | null, home: string = homedir()): string {
  const value = root ?? DEFAULT_ASSET_LIBRARY_ROOT;
  if (value === '~') return home;
  if (value.startsWith('~/')) return join(home, value.slice(2));
  return value;
}

const EXT_KIND: Record<string, GameLibraryAssetKind> = {
  '.glb': 'model', '.gltf': 'model', '.fbx': 'model', '.obj': 'model',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.gif': 'image', '.svg': 'image', '.avif': 'image',
  '.mp3': 'audio', '.wav': 'audio', '.ogg': 'audio', '.flac': 'audio', '.m4a': 'audio',
  '.ttf': 'font', '.otf': 'font', '.woff': 'font', '.woff2': 'font',
  '.md': 'doc', '.txt': 'doc', '.pdf': 'doc',
};

/** A kind from the extension alone; `other` when unknown. */
export function inferKind(path: string): GameLibraryAssetKind {
  return EXT_KIND[extname(path).toLowerCase()] ?? 'other';
}

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.avif': 'image/avif',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.m4a': 'audio/mp4',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
};

/** A catalog path is safe when it is relative, `/`-separated and has no `..` or empty segment. */
export function isSafeRelativePath(path: string): boolean {
  if (path === '' || path.includes('\0') || path.includes('\\') || isAbsolute(path) || path.startsWith('/')) return false;
  return path.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

type CatalogLike = { game?: unknown; entries?: unknown; files?: unknown };

const asString = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function toAsset(raw: unknown): GameLibraryAsset | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as Record<string, unknown>;
  const path = asString(e.path);
  if (path === null || !isSafeRelativePath(path)) return null;
  const manifest = typeof e.manifest === 'object' && e.manifest !== null ? (e.manifest as Record<string, unknown>) : null;
  const kindParse = GameLibraryAssetKindSchema.safeParse(manifest?.kind);
  const bytes = typeof e.bytes === 'number' && Number.isFinite(e.bytes) && e.bytes >= 0 ? Math.floor(e.bytes) : 0;
  return {
    path,
    category: asString(e.category) ?? '',
    source: asString(e.source) ?? '',
    bytes,
    sha256: asString(e.sha256) ?? '',
    name: asString(manifest?.name) ?? basename(path, extname(path)),
    kind: kindParse.success ? kindParse.data : inferKind(path),
  };
}

/**
 * Parse a `catalog.json` body. Accepts `{entries:[…]}` (what the real catalogs hold), `{files:[…]}`
 * and a bare array; rows that are malformed or escape the collection are dropped. Returns `null`
 * when the document has no entry list at all (so the caller can fall back to walking).
 */
export function parseCatalog(json: unknown): { title: string | null; assets: GameLibraryAsset[] } | null {
  let list: unknown;
  let title: string | null = null;
  if (Array.isArray(json)) list = json;
  else if (typeof json === 'object' && json !== null) {
    const doc = json as CatalogLike;
    title = asString(doc.game);
    list = Array.isArray(doc.entries) ? doc.entries : Array.isArray(doc.files) ? doc.files : undefined;
  }
  if (!Array.isArray(list)) return null;
  const assets = list.map(toAsset).filter((a): a is GameLibraryAsset => a !== null);
  return { title, assets };
}

const WALK_SKIP = new Set(['catalog.json', 'CATALOG.md', '.DS_Store']);
const WALK_MAX_FILES = 20_000;

/** Walk a collection folder, inferring kind from the extension. Symlinks are not followed. */
export async function walkCollection(dir: string): Promise<GameLibraryAsset[]> {
  const out: GameLibraryAsset[] = [];
  const visit = async (rel: string): Promise<void> => {
    if (out.length >= WALK_MAX_FILES) return;
    let entries;
    try {
      entries = await readdir(join(dir, rel), { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.') || (rel === '' && WALK_SKIP.has(entry.name))) continue;
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) await visit(childRel);
      else if (entry.isFile()) {
        let bytes = 0;
        try {
          bytes = (await stat(join(dir, childRel))).size;
        } catch {
          /* unreadable file lists with 0 bytes */
        }
        out.push({
          path: childRel,
          category: rel,
          source: '',
          bytes,
          sha256: '',
          name: basename(entry.name, extname(entry.name)),
          kind: inferKind(entry.name),
        });
      }
    }
  };
  await visit('');
  return out;
}

async function listCollection(root: string, id: string): Promise<GameLibraryCollection> {
  const dir = join(root, id);
  let warning: string | null = null;
  try {
    const parsed = parseCatalog(JSON.parse(await readFile(join(dir, 'catalog.json'), 'utf8')));
    if (parsed) {
      return {
        id,
        title: parsed.title ?? id,
        origin: 'catalog',
        assets: parsed.assets,
        totalBytes: parsed.assets.reduce((sum, a) => sum + a.bytes, 0),
        warning: null,
      };
    }
    warning = 'catalog.json has no entries list; listed by walking the folder.';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') warning = 'catalog.json could not be read; listed by walking the folder.';
  }
  const assets = await walkCollection(dir);
  return { id, title: id, origin: 'walk', assets, totalBytes: assets.reduce((sum, a) => sum + a.bytes, 0), warning };
}

/** List every collection (a sub-folder) under `root`. A missing root is an empty listing. */
export async function listLibrary(rootInput: string): Promise<GameLibraryListing> {
  let root: string;
  try {
    root = await realpath(rootInput);
    if (!(await stat(root)).isDirectory()) return { root: rootInput, exists: false, collections: [] };
  } catch {
    return { root: rootInput, exists: false, collections: [] };
  }
  let names: string[] = [];
  try {
    names = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name);
  } catch {
    /* unreadable root lists nothing */
  }
  names.sort((a, b) => a.localeCompare(b));
  const collections = await Promise.all(names.map((id) => listCollection(root, id)));
  return { root, exists: true, collections };
}

/**
 * Resolve `collection/path` inside the library, or `null` when it would escape the root (traversal,
 * absolute path, a symlink pointing outside) or does not exist. The one confinement point; the
 * import unit reuses it.
 */
export async function resolveInLibrary(rootInput: string, collection: string, path: string): Promise<string | null> {
  if (!isSafeRelativePath(collection) || collection.includes('/') || !isSafeRelativePath(path)) return null;
  try {
    const root = await realpath(rootInput);
    const real = await realpath(join(root, collection, ...path.split('/')));
    const rel = relative(root, real);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel) || rel.split(sep)[0] !== collection) return null;
    return real;
  } catch {
    return null;
  }
}

export type LibraryReadResult = { ok: true; value: GameLibraryFile } | { ok: false; kind: 'error'; message: string };

/** Read one library file for preview: image/audio under the cap come back as a data URL. */
export async function readLibraryFile(rootInput: string, collection: string, path: string): Promise<LibraryReadResult> {
  const abs = await resolveInLibrary(rootInput, collection, path);
  if (abs === null) return { ok: false, kind: 'error', message: 'That file is not inside the asset library.' };
  try {
    const info = await stat(abs);
    if (!info.isFile()) return { ok: false, kind: 'error', message: 'Not a file.' };
    const mime = MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream';
    const previewable = mime.startsWith('image/') || mime.startsWith('audio/');
    const dataUrl = previewable && info.size <= GAME_LIBRARY_PREVIEW_MAX_BYTES ? `data:${mime};base64,${(await readFile(abs)).toString('base64')}` : null;
    return { ok: true, value: { absolutePath: abs, mime, bytes: info.size, dataUrl } };
  } catch (error) {
    return { ok: false, kind: 'error', message: error instanceof Error ? error.message : 'Could not read the file.' };
  }
}
