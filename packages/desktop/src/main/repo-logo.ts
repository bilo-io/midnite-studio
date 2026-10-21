import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Deterministic repo-logo finder (no LLM). Probes a fixed, bounded set of
 * locations for a favicon or logo and returns it as a data URL, so the
 * renderer needs no `file://` access.
 *
 * Candidates
 *   dirs   — the repo root, `public`, `static`, `assets`, `app`, `src`, `docs`,
 *            `.github`, `src/assets`, `app/assets`, plus each of those under
 *            every `packages/*` and `apps/*` workspace (one level of
 *            `readdir` per monorepo root; never a recursive walk).
 *   names  — `logo`, `icon`, `favicon` with `.svg`, `.png`, `.ico`.
 *
 * Priority (first wins)
 *   1. format:  SVG, then PNG, then ICO
 *   2. name:    logo, then icon, then favicon
 *   3. PNG only: larger file first (a proxy for resolution)
 *   4. location: shallower directory first, then the DIRS order above
 *
 * Files over {@link REPO_LOGO_MAX_BYTES} or empty are skipped. Results
 * (including "nothing found") are cached per repo path for the process.
 */
export const REPO_LOGO_MAX_BYTES = 256 * 1024;

const BASE_DIRS = ['', 'public', 'static', 'assets', 'app', 'src', 'docs', '.github', 'src/assets', 'app/assets'];
const WORKSPACE_ROOTS = ['packages', 'apps'];
/** Workspace dirs never worth descending into. */
const SKIP = new Set(['node_modules', '.git', 'dist', 'build']);
const FORMATS = [
  { ext: 'svg', mime: 'image/svg+xml' },
  { ext: 'png', mime: 'image/png' },
  { ext: 'ico', mime: 'image/x-icon' },
] as const;
const NAMES = ['logo', 'icon', 'favicon'] as const;

type Candidate = {
  path: string;
  mime: string;
  formatRank: number;
  nameRank: number;
  size: number;
  dirRank: number;
  depth: number;
};

const cache = new Map<string, string | null>();

export function clearRepoLogoCache(): void {
  cache.clear();
}

async function workspaceDirs(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const wsRoot of WORKSPACE_ROOTS) {
    let names: string[];
    try {
      names = await readdir(join(root, wsRoot));
    } catch {
      continue;
    }
    for (const name of names.sort()) {
      if (SKIP.has(name) || name.startsWith('.')) continue;
      for (const sub of BASE_DIRS.filter((d) => d !== '' && !d.includes('/') && d !== 'docs' && d !== '.github')) {
        out.push(`${wsRoot}/${name}/${sub}`);
      }
    }
  }
  return out;
}

async function statFile(path: string): Promise<number | null> {
  try {
    const s = await stat(path);
    return s.isFile() && s.size > 0 && s.size <= REPO_LOGO_MAX_BYTES ? s.size : null;
  } catch {
    return null;
  }
}

/** Rank candidates; exported-shape stays internal, ordering is what tests pin. */
function compare(a: Candidate, b: Candidate): number {
  if (a.formatRank !== b.formatRank) return a.formatRank - b.formatRank;
  if (a.nameRank !== b.nameRank) return a.nameRank - b.nameRank;
  if (a.mime === 'image/png' && a.size !== b.size) return b.size - a.size;
  if (a.depth !== b.depth) return a.depth - b.depth;
  return a.dirRank - b.dirRank;
}

/** Absolute path of the best logo under `root`, or null. */
export async function findRepoLogoPath(root: string): Promise<string | null> {
  const dirs = [...BASE_DIRS, ...(await workspaceDirs(root))];
  const probes: Array<Promise<Candidate | null>> = [];
  dirs.forEach((dir, dirRank) => {
    const depth = dir === '' ? 0 : dir.split('/').length;
    FORMATS.forEach((fmt, formatRank) => {
      NAMES.forEach((name, nameRank) => {
        const path = join(root, dir, `${name}.${fmt.ext}`);
        probes.push(
          statFile(path).then((size) =>
            size === null ? null : { path, mime: fmt.mime, formatRank, nameRank, size, dirRank, depth },
          ),
        );
      });
    });
  });
  const found = (await Promise.all(probes)).filter((c): c is Candidate => c !== null);
  found.sort(compare);
  return found[0]?.path ?? null;
}

const MIME_BY_EXT: Record<string, string> = Object.fromEntries(FORMATS.map((f) => [f.ext, f.mime]));

/** Data URL of the best logo for the repo at `root`; null when none. Never throws. */
export async function findRepoLogo(root: string): Promise<string | null> {
  if (cache.has(root)) return cache.get(root) ?? null;
  let result: string | null = null;
  try {
    const path = await findRepoLogoPath(root);
    if (path) {
      const mime = MIME_BY_EXT[path.slice(path.lastIndexOf('.') + 1)];
      const bytes = await readFile(path);
      if (mime && bytes.length <= REPO_LOGO_MAX_BYTES) {
        result = `data:${mime};base64,${bytes.toString('base64')}`;
      }
    }
  } catch {
    result = null;
  }
  cache.set(root, result);
  return result;
}
