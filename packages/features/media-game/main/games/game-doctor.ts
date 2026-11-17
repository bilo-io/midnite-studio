import { lstat, readdir, readFile, stat } from 'node:fs/promises';
import { join, posix } from 'node:path';

import {
  compareSemver,
  GAME_ASSET_KINDS,
  GAME_GENRES,
  GAME_KIT_VERSION,
  GAME_LEVEL_EXT,
  GAME_LEVEL_MAX_BYTES,
  GAME_LEVELS_DIR,
  GAME_MANIFEST_FILE,
  GAME_RULES,
  GameManifestSchema,
  parseGameLevel,
  parseGameManifest,
  rawManifestHasLegacyVendored,
  type GameAssetProvenance,
  type GameDiagnosis,
  type GameDiagnosisStatus,
  type GameFinding,
  type GameFixId,
  type GameManifest,
  type GameRuleId,
  type GameRuleLevel,
} from '@midnite/studio-shared';
import { joinWithin } from '@midnite/studio-runtime';

import { hashAsset } from './asset-bridge';

/**
 * The game doctor (Phase 149 Theme C): checks a game folder against the Midnite game standard
 * (`docs/GAME_STANDARD.md`, `GAME_RULES`) and names every gap as a finding with its rule id, a fix hint and,
 * where Theme D has one, a `fixId`. Read-only, and it never throws: an fs error becomes a finding or is skipped.
 *
 * `diagnoseGame` runs every check. `diagnoseGameCheap` runs the manifest, entry and kit checks only — no source
 * walk, no level parsing, no asset hashing — so `listGames` stays a few fs reads per game (Decision 6).
 */

/** Files the hook search reads before it gives up (the walk skips `node_modules`, `vendor`, `dist`, `.git`). */
export const DOCTOR_SOURCE_WALK_MAX_FILES = 2000;
/** A listed asset bigger than this is not hashed, and raises nothing. */
export const DOCTOR_HASH_MAX_BYTES = 50 * 1024 * 1024;
/** Where the hand-written-world migration recipe lives; `levels.none` points here. */
export const DOCTOR_LEVELS_RECIPE = 'the Levels section of the midnite-media-game-build skill';

const WALK_SKIP = new Set(['node_modules', 'vendor', 'dist', '.git']);
const SOURCE_EXT = /\.(?:m?js|jsx|ts|tsx|html)$/;
const SOURCE_FILE_MAX_BYTES = 2 * 1024 * 1024;
/** `window.__midnite` is installed by `installHook`, which the kit's engine entries (`kit/phaser/boot.js`, `kit/three/loop.js`) call. */
const HOOK_PATTERN = /\binstallHook\b|kit\/phaser\/boot(?:\.js)?\b|kit\/three\/loop(?:\.js)?\b/;
const BUNDLERS = ['vite', 'webpack', 'esbuild', 'parcel', 'typescript'];

type Check = { rule: GameRuleId; message: string; path?: string | null; fixId?: GameFixId | null; level?: GameRuleLevel };

/** What the manifest checks learned, for the checks after them. Fields read leniently when the schema fails. */
type ManifestFacts = {
  hasManifest: boolean;
  /** The parsed manifest, when it is valid. */
  manifest: GameManifest | null;
  build: GameManifest['build'] | null;
  kitVersion: string | null;
  levels: GameManifest['levels'] | null;
  assets: GameAssetProvenance[] | null;
};

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function readText(path: string, maxBytes = SOURCE_FILE_MAX_BYTES): Promise<string | null> {
  try {
    if ((await stat(path)).size > maxBytes) return null;
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

/** One sub-field of the raw manifest, kept only if it passes its own part of the schema. */
function lenientField<K extends 'build' | 'kitVersion' | 'levels' | 'assets'>(raw: unknown, key: K): GameManifest[K] | null {
  if (typeof raw !== 'object' || raw === null || !(key in raw)) return null;
  const parsed = GameManifestSchema.shape[key].safeParse((raw as Record<string, unknown>)[key]);
  return parsed.success ? (parsed.data as GameManifest[K]) : null;
}

async function checkManifest(root: string, add: (c: Check) => void): Promise<ManifestFacts> {
  const none: ManifestFacts = { hasManifest: false, manifest: null, build: null, kitVersion: null, levels: null, assets: null };
  let text: string;
  try {
    text = await readFile(join(root, GAME_MANIFEST_FILE), 'utf8');
  } catch {
    add({ rule: 'manifest.missing', message: `No ${GAME_MANIFEST_FILE} at the game's root.`, path: GAME_MANIFEST_FILE, fixId: 'write-manifest' });
    return none;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    add({ rule: 'manifest.invalid-json', message: `${GAME_MANIFEST_FILE} is not valid JSON: ${message(error)}`, path: GAME_MANIFEST_FILE });
    return { ...none, hasManifest: true };
  }

  if (rawManifestHasLegacyVendored(raw)) {
    add({ rule: 'manifest.vendored-legacy', message: '`vendored` is `true`; it should name the vendored engine versions.', path: GAME_MANIFEST_FILE, fixId: 'normalise-vendored' });
  }
  const genre = typeof raw === 'object' && raw !== null ? (raw as { genre?: unknown }).genre : undefined;
  const genreUnknown = typeof genre === 'string' && !(GAME_GENRES as readonly string[]).includes(genre);
  if (genreUnknown) {
    add({ rule: 'manifest.genre-unknown', message: `Genre "${genre}" is not one Midnite knows; use a known genre or null (custom).`, path: GAME_MANIFEST_FILE, fixId: 'set-genre' });
  }

  const parsed = parseGameManifest(raw);
  if (!parsed.ok) {
    for (const issue of parsed.issues) {
      // The genre is reported once, as `manifest.genre-unknown`.
      if (genreUnknown && issue.path === 'genre') continue;
      add({ rule: 'manifest.schema', message: `${issue.path}: ${issue.message}`, path: GAME_MANIFEST_FILE });
    }
  }
  const manifest = parsed.ok ? parsed.manifest : null;
  return {
    hasManifest: true,
    manifest,
    build: manifest ? (manifest.build ?? null) : lenientField(raw, 'build'),
    kitVersion: manifest ? manifest.kitVersion : lenientField(raw, 'kitVersion'),
    levels: manifest ? (manifest.levels ?? null) : lenientField(raw, 'levels'),
    assets: manifest ? manifest.assets : lenientField(raw, 'assets'),
  };
}

/** True when `index.html` loads a TypeScript module or imports a bare specifier: it needs a bundler to run. */
function htmlNeedsBundler(html: string): boolean {
  const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi);
  for (const [, attrs = '', body = ''] of scripts) {
    if (!/\btype\s*=\s*["']module["']/i.test(attrs)) continue;
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (src !== undefined && /\.tsx?(?:[?#].*)?$/i.test(src)) return true;
    for (const m of body.matchAll(/\bimport\s*(?:[^'"()]*?\s*from\s*)?['"]([^'"]+)['"]/g)) {
      const spec = m[1] ?? '';
      if (!/^(?:\.{0,2}\/|[a-z][a-z0-9+.-]*:)/i.test(spec)) return true;
    }
  }
  return false;
}

async function packageUsesBundler(root: string): Promise<boolean> {
  const text = await readText(join(root, 'package.json'));
  if (text === null) return false;
  try {
    const pkg = JSON.parse(text) as { dependencies?: unknown; devDependencies?: unknown };
    const names = [pkg.dependencies, pkg.devDependencies].flatMap((deps) => (deps && typeof deps === 'object' ? Object.keys(deps) : []));
    return names.some((name) => BUNDLERS.includes(name));
  } catch {
    return false;
  }
}

async function checkEntry(root: string, facts: ManifestFacts, add: (c: Check) => void): Promise<void> {
  if (facts.build) {
    const out = joinWithin(root, facts.build.out);
    if (out === null || !(await isFile(join(out, 'index.html')))) {
      add({
        rule: 'entry.build-out-missing',
        level: 'info',
        message: `${posix.join(facts.build.out, 'index.html')} does not exist yet; Run builds it with \`${facts.build.command}\`.`,
        path: posix.join(facts.build.out, 'index.html'),
      });
    }
    return;
  }
  const html = await readText(join(root, 'index.html'));
  if (html === null) {
    add({ rule: 'entry.missing', message: 'No index.html at the game\'s root.', path: 'index.html' });
    return;
  }
  if (htmlNeedsBundler(html) && (await packageUsesBundler(root))) {
    add({
      rule: 'entry.bundled-without-build',
      message: 'index.html needs a bundler (TypeScript or bare imports) but the manifest has no `build` block.',
      path: 'index.html',
      fixId: 'add-build',
    });
  }
}

async function checkKit(root: string, facts: ManifestFacts, add: (c: Check) => void): Promise<boolean> {
  const hasKit = await isDir(join(root, 'kit'));
  if (!hasKit) {
    add({ rule: 'kit.missing', level: facts.build ? 'info' : 'warn', message: 'No kit/ folder.', path: 'kit' });
    return false;
  }
  if (facts.kitVersion !== null) {
    const cmp = compareSemver(facts.kitVersion, GAME_KIT_VERSION);
    if (cmp !== null && cmp < 0) {
      add({ rule: 'kit.outdated', message: `Kit ${facts.kitVersion} is older than ${GAME_KIT_VERSION}.`, path: 'kit', fixId: 'upgrade-kit' });
    }
  }
  return true;
}

/** True when some source file under `src/` (or `index.html`) installs `window.__midnite`. Bounded; skips heavy folders. */
async function sourceInstallsHook(root: string): Promise<boolean> {
  const html = await readText(join(root, 'index.html'));
  if (html !== null && HOOK_PATTERN.test(html)) return true;
  let budget = DOCTOR_SOURCE_WALK_MAX_FILES;
  const visit = async (dir: string): Promise<boolean> => {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const entry of entries) {
      if (budget <= 0) return false;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (WALK_SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
        if (await visit(abs)) return true;
      } else if (entry.isFile()) {
        budget -= 1;
        if (!SOURCE_EXT.test(entry.name)) continue;
        const text = await readText(abs);
        if (text !== null && HOOK_PATTERN.test(text)) return true;
      }
    }
    return false;
  };
  return visit(join(root, 'src'));
}

async function checkLevels(root: string, facts: ManifestFacts, add: (c: Check) => void): Promise<void> {
  let names: string[] = [];
  try {
    names = (await readdir(join(root, GAME_LEVELS_DIR))).filter((name) => name.endsWith(GAME_LEVEL_EXT)).sort();
  } catch {
    names = [];
  }
  if (names.length === 0) {
    add({
      rule: 'levels.none',
      message: `No ${GAME_LEVELS_DIR}/*${GAME_LEVEL_EXT}, so the Level editor has nothing to open. To move a hand-written world into levels, see ${DOCTOR_LEVELS_RECIPE}.`,
      path: GAME_LEVELS_DIR,
    });
  } else if (facts.hasManifest && facts.levels === null) {
    add({
      rule: 'levels.not-declared',
      message: `${names.length} level file(s) exist but the manifest has no \`levels\`, so the game does not read them.`,
      path: GAME_MANIFEST_FILE,
      fixId: 'declare-levels',
    });
  }
  if (facts.levels && !names.includes(`${facts.levels.start}${GAME_LEVEL_EXT}`)) {
    add({
      rule: 'levels.start-missing',
      message: `levels.start is "${facts.levels.start}" but ${GAME_LEVELS_DIR}/${facts.levels.start}${GAME_LEVEL_EXT} does not exist.`,
      path: posix.join(GAME_LEVELS_DIR, `${facts.levels.start}${GAME_LEVEL_EXT}`),
    });
  }
  for (const name of names) {
    const rel = posix.join(GAME_LEVELS_DIR, name);
    const abs = join(root, GAME_LEVELS_DIR, name);
    let problem: string | null = null;
    try {
      if ((await lstat(abs)).isSymbolicLink()) continue;
      if ((await stat(abs)).size > GAME_LEVEL_MAX_BYTES) {
        problem = `is over ${GAME_LEVEL_MAX_BYTES / 1048576} MB`;
      } else {
        const parsed = parseGameLevel(JSON.parse(await readFile(abs, 'utf8')));
        if (!parsed.ok) {
          const first = parsed.issues[0];
          problem = `is not a valid level (${first ? `${first.path}: ${first.message}` : 'unknown shape'})`;
        }
      }
    } catch (error) {
      problem = `is not valid JSON (${message(error)})`;
    }
    if (problem !== null) add({ rule: 'levels.invalid', message: `${rel} ${problem}.`, path: rel });
  }
}

/** Total bytes under a folder, or `null` once it passes `limit` (or the file budget runs out). */
async function folderBytes(dir: string, limit: number): Promise<number | null> {
  let total = 0;
  let files = 0;
  const visit = async (path: string): Promise<boolean> => {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      return true;
    }
    for (const entry of entries) {
      const abs = join(path, entry.name);
      if (entry.isDirectory()) {
        if (!(await visit(abs))) return false;
      } else if (entry.isFile()) {
        files += 1;
        if (files > DOCTOR_SOURCE_WALK_MAX_FILES) return false;
        try {
          total += (await stat(abs)).size;
        } catch {
          // Gone mid-walk.
        }
        if (total > limit) return false;
      }
    }
    return true;
  };
  return (await visit(dir)) ? total : null;
}

async function checkAssets(root: string, facts: ManifestFacts, add: (c: Check) => void): Promise<void> {
  const listed = facts.assets ?? [];
  const listedPaths = listed.map((asset) => posix.normalize(asset.path.replace(/\\/g, '/')).replace(/\/+$/, ''));
  const covered = (rel: string): boolean => listedPaths.some((path) => path === rel || rel.startsWith(`${path}/`) || path.startsWith(`${rel}/`));

  // Unlisted: each entry directly under `assets/<kind>/` that no listed asset covers.
  if (facts.assets !== null) {
    for (const kind of GAME_ASSET_KINDS) {
      let entries: string[];
      try {
        entries = (await readdir(join(root, 'assets', kind))).filter((name) => !name.startsWith('.')).sort();
      } catch {
        continue;
      }
      for (const name of entries) {
        const rel = posix.join('assets', kind, name);
        if (!covered(rel)) add({ rule: 'assets.unlisted', message: `${rel} is not in the manifest's \`assets\`, so re-sync cannot track it.`, path: rel });
      }
    }
  }

  for (const asset of listed) {
    const abs = joinWithin(root, asset.path);
    let info: import('node:fs').Stats | null = null;
    try {
      info = abs === null ? null : await stat(abs);
    } catch {
      info = null;
    }
    if (abs === null || info === null) {
      add({ rule: 'assets.missing-file', message: `Asset "${asset.name}" lists ${asset.path}, which ${abs === null ? 'is outside the game' : 'does not exist'}.`, path: asset.path });
      continue;
    }
    const bytes = info.isDirectory() ? await folderBytes(abs, DOCTOR_HASH_MAX_BYTES) : info.size;
    if (bytes === null || bytes > DOCTOR_HASH_MAX_BYTES) continue;
    const hashed = await hashAsset(abs, info.isDirectory());
    if (hashed.ok && hashed.value.sha256 !== asset.sha256) {
      add({ rule: 'assets.hash-mismatch', message: `Asset "${asset.name}" (${asset.path}) changed since it was imported.`, path: asset.path });
    }
  }
}

function summarise(path: string, hasManifest: boolean, findings: GameFinding[]): GameDiagnosis {
  const counts = { error: 0, warn: 0, info: 0 };
  for (const finding of findings) counts[finding.level] += 1;
  const status: GameDiagnosisStatus = counts.error > 0 ? 'error' : counts.warn > 0 ? 'warn' : 'ok';
  return { path, hasManifest, findings, counts, status };
}

async function diagnose(path: string, depth: 'full' | 'cheap'): Promise<GameDiagnosis> {
  const findings: GameFinding[] = [];
  const add = (check: Check): void => {
    const rule = GAME_RULES[check.rule];
    findings.push({
      rule: check.rule,
      level: check.level ?? rule.level,
      area: rule.area,
      message: check.message,
      path: check.path ?? null,
      fixId: check.fixId ?? null,
    });
  };
  let hasManifest = false;
  try {
    const facts = await checkManifest(path, add);
    hasManifest = facts.hasManifest;
    await checkEntry(path, facts, add);
    const hasKit = await checkKit(path, facts, add);
    if (depth === 'full') {
      if (!(await sourceInstallsHook(path))) {
        add({
          rule: 'kit.hook-missing',
          message: `Nothing under src/ calls \`installHook\` or imports the kit's engine entry, so \`window.__midnite\` is never installed${hasKit ? '' : ' (and there is no kit/ to install it)'}.`,
          path: 'src',
        });
      }
      await checkLevels(path, facts, add);
      await checkAssets(path, facts, add);
    }
  } catch {
    // Never throws: whatever was found before the failure stands.
  }
  return summarise(path, hasManifest, findings);
}

/** Every check against the Midnite game standard, in the doctor's order. Read-only; never throws. */
export function diagnoseGame(path: string): Promise<GameDiagnosis> {
  return diagnose(path, 'full');
}

/** The list's diagnosis: manifest, entry and kit only — no source walk, level parsing or asset hashing. */
export function diagnoseGameCheap(path: string): Promise<GameDiagnosis> {
  return diagnose(path, 'cheap');
}
