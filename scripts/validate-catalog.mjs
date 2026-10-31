#!/usr/bin/env node
// validate-catalog — run a built `catalog.json` through the LAUNCHER'S OWN parser before anything is
// published (release.yml's `assemble` job).
//
// `scripts/build-catalog.mjs` writes the file; the launcher reads it with `parseCatalog`
// (`apps/launcher/src/common/catalog-feed.ts`), which returns `null` — and silently falls back to
// `midnite-studio/version.json` — for a malformed file or one that breaks lockstep. A publish that
// the launcher then ignores is the failure this guard exists for.
//
// The parser is TypeScript with a zod import, so it is bundled on the fly with esbuild (resolved from
// apps/launcher, which already depends on it for `scripts/bundle.mjs`) into a temp CJS file and
// required: the real function, not a re-implementation of its schema. Needs `pnpm install`.
//
// Usage: node scripts/validate-catalog.mjs <catalog.json> [--version X.Y.Z] [--expect-app <id> …]
//   --version     also require runtimeVersion to be exactly this (the release's version)
//   --expect-app  also require this app id to be listed (repeatable)
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const launcherDir = path.join(repoRoot, 'apps/launcher');

/** Bundle the launcher's catalog parser and return `parseCatalog`. */
export async function loadLauncherParseCatalog() {
  const launcherRequire = createRequire(path.join(launcherDir, 'package.json'));
  const { build } = launcherRequire('esbuild');
  const outDir = mkdtempSync(path.join(tmpdir(), 'validate-catalog-'));
  try {
    const outfile = path.join(outDir, 'catalog-feed.cjs');
    await build({
      entryPoints: [path.join(launcherDir, 'src/common/catalog-feed.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node20',
      outfile,
      logLevel: 'warning',
    });
    return createRequire(outfile)(outfile).parseCatalog;
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

/**
 * @param {unknown} json parsed catalog.json
 * @param {(json: unknown) => unknown} parseCatalog the launcher's parser
 * @param {{ version?: string, expectApps?: string[] }} [expect]
 * @returns {{ ok: true, catalog: { runtimeVersion: string, apps: { id: string }[] } } | { ok: false, errors: string[] }}
 */
export function validateCatalog(json, parseCatalog, expect = {}) {
  const catalog = parseCatalog(json);
  if (!catalog) {
    return {
      ok: false,
      errors: ['the launcher would REJECT this catalog.json (malformed, or an app version differs from runtimeVersion) and fall back to version.json'],
    };
  }
  const errors = [];
  if (expect.version && catalog.runtimeVersion !== expect.version) {
    errors.push(`runtimeVersion is ${catalog.runtimeVersion}, the release is ${expect.version}`);
  }
  const listed = new Set(catalog.apps.map((app) => app.id));
  for (const id of expect.expectApps ?? []) {
    if (!listed.has(id)) errors.push(`app "${id}" is not listed`);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, catalog };
}

export function parseArgs(argv) {
  const out = { file: undefined, version: undefined, expectApps: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--version' || arg === '--expect-app') {
      const value = argv[(i += 1)];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      if (arg === '--version') out.version = value.replace(/^v/, '');
      else out.expectApps.push(value);
    } else if (arg.startsWith('--')) {
      throw new Error(`unknown flag: ${arg}`);
    } else if (out.file === undefined) {
      out.file = arg;
    } else {
      throw new Error(`unexpected argument: ${arg}`);
    }
  }
  if (!out.file) throw new Error('usage: validate-catalog.mjs <catalog.json> [--version X.Y.Z] [--expect-app <id> …]');
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { file, version, expectApps } = parseArgs(process.argv.slice(2));
    const result = validateCatalog(JSON.parse(readFileSync(file, 'utf8')), await loadLauncherParseCatalog(), {
      version,
      expectApps,
    });
    if (!result.ok) {
      for (const error of result.errors) console.error(`validate-catalog: ${error}`);
      process.exit(1);
    }
    const ids = result.catalog.apps.map((app) => app.id).join(', ');
    console.log(`validate-catalog: OK — ${result.catalog.apps.length} app(s) at ${result.catalog.runtimeVersion}: ${ids}`);
  } catch (err) {
    console.error(`validate-catalog: ${err.message}`);
    process.exit(1);
  }
}
