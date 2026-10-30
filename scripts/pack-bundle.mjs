#!/usr/bin/env node
// Packs an app's built `dist/` into the zip a release attaches and the launcher installs:
//   dist/**  +  icon.icns  +  package.json {name, version[, main]}
// `main` is set only when the build wrote `dist/main.cjs` (an app with an Electron side) — that file is
// what the launcher's stub runs as `Resources/app`'s main. Used by release.yml's `bundles` job and by
// apps/launcher's install proof, so the zip a test installs is the zip a release ships.
// Usage: node scripts/pack-bundle.mjs --app vanguard --dir apps/vanguard --version 0.4.0 --out <dir> [--stage <dir>]
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** @returns {string} the zip's path. */
export function packBundle({ app, dir, version, out, stage }) {
  const icon = path.join(dir, 'resources', 'icon.icns');
  if (!existsSync(icon)) throw new Error(`${app} has no resources/icon.icns`);
  const staged = stage ?? mkdtempSync(path.join(tmpdir(), `pack-${app}-`));
  rmSync(staged, { recursive: true, force: true });
  mkdirSync(staged, { recursive: true });
  cpSync(path.join(dir, 'dist'), staged, { recursive: true });
  cpSync(icon, path.join(staged, 'icon.icns'));
  const pkg = { name: `midnite-${app}`, version };
  if (existsSync(path.join(staged, 'main.cjs'))) pkg.main = 'main.cjs';
  writeFileSync(path.join(staged, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  mkdirSync(out, { recursive: true });
  const zip = path.resolve(out, `midnite-${app}-${version}-bundle.zip`);
  rmSync(zip, { force: true });
  execFileSync('zip', ['-qr', zip, '.'], { cwd: staged });
  return zip;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = Object.fromEntries(
    process.argv.slice(2).flatMap((a, i, all) => (a.startsWith('--') ? [[a.slice(2), all[i + 1]]] : [])),
  );
  for (const k of ['app', 'dir', 'version', 'out']) if (!args[k]) throw new Error(`--${k} is required`);
  console.log(packBundle(args));
}
