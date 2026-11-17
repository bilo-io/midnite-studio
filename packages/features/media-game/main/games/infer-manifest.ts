import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import {
  failure,
  GAME_MANIFEST_FILE,
  ok,
  parseGameManifest,
  type GameManifest,
  type GitOpResult,
} from '@midnite/studio-shared';

/**
 * Infer a `midnite-game.json` for a folder that has none (Phase 149 Themes D and F). Only Phaser and three.js
 * games are supported, so anything else is refused. The result is a proposal: `write-manifest` writes it, and the
 * Open Game sheet lets the user edit it first. Never throws.
 */

const UNSUPPORTED = 'Only Phaser and three.js games are supported.';

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** `my-cool_game` becomes `My Cool Game`. */
export function humaniseName(raw: string): string {
  const words = raw
    .replace(/^@[^/]+\//, '')
    .split(/[\s._-]+/)
    .filter((word) => word !== '');
  const name = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  return name.slice(0, 80);
}

function depVersion(pkg: Record<string, unknown> | null, name: string): string | null {
  if (!pkg) return null;
  for (const key of ['dependencies', 'devDependencies']) {
    const block = pkg[key];
    if (block !== null && typeof block === 'object') {
      const value = (block as Record<string, unknown>)[name];
      if (typeof value === 'string') return value.replace(/^[^\d]*/, '') || null;
    }
  }
  return null;
}

/** A vendored engine's version: `vendor/<engine>/package.json` when it has one. */
async function vendoredVersion(path: string, engine: string): Promise<string | null> {
  const pkg = await readJson(join(path, 'vendor', engine, 'package.json'));
  return pkg && typeof pkg.version === 'string' ? pkg.version : null;
}

async function hasVendoredEngine(path: string, engine: string): Promise<boolean> {
  return exists(join(path, 'vendor', engine));
}

/** The package manager's build command, from the lockfile that is present (npm when none is). */
export async function detectBuildCommand(path: string): Promise<string> {
  if (await exists(join(path, 'pnpm-lock.yaml'))) return 'pnpm build';
  if (await exists(join(path, 'yarn.lock'))) return 'yarn build';
  return 'npm run build';
}

/** `build.outDir` from a `vite.config.*` when it is a string literal, else `dist`. */
export async function detectBuildOut(path: string): Promise<string> {
  let names: string[];
  try {
    names = await readdir(path);
  } catch {
    return 'dist';
  }
  for (const file of names.filter((n) => /^vite\.config\.(?:[mc]?[jt]s)$/.test(n)).sort()) {
    let source: string;
    try {
      source = await readFile(join(path, file), 'utf8');
    } catch {
      continue;
    }
    const match = /\boutDir\s*:\s*(['"`])([^'"`$\\]+)\1/.exec(source);
    const out = match?.[2];
    if (out !== undefined && !out.startsWith('/') && !out.split(/[\\/]/).includes('..')) return out.replace(/^\.\//, '').replace(/\/+$/, '') || 'dist';
  }
  return 'dist';
}

export async function inferBuild(path: string): Promise<{ command: string; out: string }> {
  return { command: await detectBuildCommand(path), out: await detectBuildOut(path) };
}

/** The engine versions a game carries: `vendor/<engine>/package.json` first, then `package.json`'s dependencies. */
export async function inferVendored(path: string, engine: 'phaser' | 'three'): Promise<Record<string, string>> {
  const root = resolve(path);
  const pkg = await readJson(join(root, 'package.json'));
  const vendored: Record<string, string> = {};
  const version = (await vendoredVersion(root, engine)) ?? depVersion(pkg, engine);
  if (version !== null) vendored[engine] = version;
  if (engine === 'three') {
    for (const name of ['rapier', 'recast']) {
      const found = await vendoredVersion(root, name);
      if (found !== null) vendored[name] = found;
    }
  }
  return vendored;
}

export async function inferManifest(path: string): Promise<GitOpResult<GameManifest>> {
  const root = resolve(path);
  const pkg = await readJson(join(root, 'package.json'));

  const threeVersion = (await vendoredVersion(root, 'three')) ?? depVersion(pkg, 'three');
  const phaserVersion = (await vendoredVersion(root, 'phaser')) ?? depVersion(pkg, 'phaser');
  const hasThree = threeVersion !== null || (await hasVendoredEngine(root, 'three'));
  const hasPhaser = phaserVersion !== null || (await hasVendoredEngine(root, 'phaser'));
  // three wins when both are present: a 3D game may carry Phaser for a HUD, not the other way round.
  const engine = hasThree ? 'three' : hasPhaser ? 'phaser' : null;
  if (engine === null) return failure(UNSUPPORTED);

  const vendored = await inferVendored(root, engine);

  const rawName = typeof pkg?.name === 'string' && pkg.name.trim() !== '' ? pkg.name : basename(root);
  const name = humaniseName(rawName) || humaniseName(basename(root)) || 'Game';

  const raw: Record<string, unknown> = {
    version: 1,
    name,
    engine,
    dimension: engine === 'three' ? '3d' : '2d',
    perspective: engine === 'three' ? 'third-person' : 'top-down',
    genre: null,
    starter: 'custom',
    entry: 'index.html',
    kitVersion: '0.0.0',
    vendored,
  };
  // A package.json with a build script means a bundler: the game is served from its build output.
  const scripts = pkg?.scripts;
  if (scripts !== null && typeof scripts === 'object' && typeof (scripts as Record<string, unknown>).build === 'string') {
    raw.build = await inferBuild(root);
  }
  const parsed = parseGameManifest(raw);
  if (!parsed.ok) return failure(`Could not infer a ${GAME_MANIFEST_FILE}: ${parsed.issues[0]?.message ?? 'invalid'}.`);
  return ok(parsed.manifest);
}
