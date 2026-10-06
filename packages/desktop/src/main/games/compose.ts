import { cp, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import {
  dimensionOf,
  failure,
  isStarterAvailable,
  ok,
  parseStarterId,
  type GameCameraId,
  type GitOpResult,
} from '@midnite/studio-shared';

/** Where a genre's systems module lives, relative to `templates/media-game/`. */
const genreDir = (genre: string): string => join('genres', genre);

/** A genre's optional manifest: `{ kitGenres: string[] }`, extra `kit/core/genre/<name>/` folders it imports. */
const GENRE_MANIFEST = 'genre.json';

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dir: string, rel = ''): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(join(dir, rel), { withFileTypes: true })) {
    const next = rel === '' ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await listFiles(dir, next)));
    else out.push(next);
  }
  return out.sort();
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Compose a starter into `dest` (an empty directory): `common/`, then the kit
 * (`kit/core` and the engine's own folder, never the other engine's), then the
 * perspective base, then the genre's module when the genre has one (its files
 * win on conflict), then `src/game.config.js` and the `{{GAME_NAME}}` fill.
 * One copy of each system — nothing is forked per combination.
 */
export async function composeStarter(
  id: string,
  dest: string,
  options: { templateDir: string; name: string; cameras?: readonly GameCameraId[] },
): Promise<GitOpResult<{ files: string[] }>> {
  const available = isStarterAvailable(id);
  if (!available.ok) return failure(available.reason);
  const parsed = parseStarterId(id)!;
  const { templateDir } = options;
  const engineDir = dimensionOf(parsed.perspective) === '2d' ? 'phaser' : 'three';

  const common = join(templateDir, 'common');
  const base = join(templateDir, 'bases', parsed.perspective);
  if (!(await exists(join(common, 'index.html'))) || !(await exists(base))) {
    return failure(`The game template is missing from this build (${templateDir}).`);
  }

  await cp(common, dest, { recursive: true, force: true });
  // The genre's own engine-free systems (`kit/core/genre/<genre>/`) and any it declares in
  // `genre.json` (`kitGenres`, e.g. ARPG pathing on RTS's A*); never another genre's.
  const genreSource = parsed.genre === null ? null : join(templateDir, genreDir(parsed.genre));
  const kitGenres = new Set<string>(parsed.genre === null ? [] : [parsed.genre]);
  if (genreSource !== null && (await exists(join(genreSource, GENRE_MANIFEST)))) {
    try {
      const declared = JSON.parse(await readFile(join(genreSource, GENRE_MANIFEST), 'utf8')) as { kitGenres?: unknown };
      if (Array.isArray(declared.kitGenres)) for (const g of declared.kitGenres) if (typeof g === 'string' && /^[a-z0-9-]+$/.test(g)) kitGenres.add(g);
    } catch {
      return failure(`The ${parsed.genre} genre's ${GENRE_MANIFEST} is not valid JSON.`);
    }
  }
  const coreDir = join(templateDir, 'kit', 'core');
  await cp(coreDir, join(dest, 'kit', 'core'), {
    recursive: true,
    filter: (src) => {
      const parts = relative(coreDir, src).split(sep);
      if (parts[0] !== 'genre') return true;
      return parts.length === 1 ? kitGenres.size > 0 : kitGenres.has(parts[1] ?? '');
    },
  });
  await cp(join(templateDir, 'kit', engineDir), join(dest, 'kit', engineDir), { recursive: true });
  await cp(base, dest, { recursive: true, force: true });

  if (parsed.genre !== null) {
    const genre = join(templateDir, genreDir(parsed.genre));
    if (await exists(genre)) {
      await cp(genre, dest, { recursive: true, force: true, filter: (src) => relative(genre, src) !== GENRE_MANIFEST });
    }
  }

  const config = { perspective: parsed.perspective, genre: parsed.genre, cameras: [...(options.cameras ?? [])] };
  await writeFile(
    join(dest, 'src', 'game.config.js'),
    `// Written by Midnite Studio when the game is created; edit freely.\n// \`cameras\` limits the third-person cycle (empty = all five).\nexport default ${JSON.stringify(config)};\n`,
    'utf8',
  );

  const files = await listFiles(dest);
  for (const file of files) {
    if (!/\.(html|md|js|json)$/.test(file)) continue;
    const path = join(dest, file);
    const raw = await readFile(path, 'utf8');
    const filled = raw.replaceAll('{{GAME_NAME}}', file.endsWith('.html') ? escapeHtml(options.name) : options.name);
    if (filled !== raw) await writeFile(path, filled, 'utf8');
  }
  return ok({ files });
}

/** The import specifiers of a JS module: `import … from '…'`, `export … from '…'` and `import('…')`. */
export function scanImports(js: string): string[] {
  const out: string[] = [];
  const code = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  const pattern = /(?:\bimport\s+(?:[^'"()]*?\s+from\s+)?|\bexport\s+[^'"()]*?\s+from\s+|\bimport\s*\(\s*)['"]([^'"]+)['"]/g;
  for (const match of code.matchAll(pattern)) out.push(match[1]!);
  return out;
}
