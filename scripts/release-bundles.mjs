#!/usr/bin/env node
// release-bundles — which app bundles does a release build? (Phase 113 Theme F1)
//
// A release always builds the runtime (Studio) and the launcher. A per-app bundle is built only when
// `scripts/affected-apps.mjs` (moon's affected projects mapped through `app-*` tags) names it AND the app
// has a moon project of its own (`apps/<id>/moon.yml`) — Studio and the launcher are built by their own
// `dist` tasks, and an app id from the placement map that has not been extracted yet has nothing to build.
//
// Usage: node scripts/affected-apps.mjs --base <prev-tag> --json | node scripts/release-bundles.mjs
//        node scripts/release-bundles.mjs --all   (a release: every extracted app — see allApps)
// Prints the matrix JSON a workflow feeds to `strategy.matrix`: {"include":[{"app","project","dir"}]}.
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Apps built by their own `dist` job, never as a bundle. */
export const NOT_BUNDLES = ['studio', 'launcher'];

/**
 * @param {string[]} apps affected app ids
 * @param {(dir: string) => boolean} hasProject whether `apps/<id>/moon.yml` exists
 * @returns {{ include: { app: string, project: string, dir: string }[] }}
 */
export function bundleMatrix(apps, hasProject) {
  const include = apps
    .filter((app) => !NOT_BUNDLES.includes(app) && hasProject(`apps/${app}`))
    .map((app) => ({ app, project: `app-${app}`, dir: `apps/${app}` }));
  return { include };
}

async function readStdin() {
  let data = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

/**
 * Every app with a moon project of its own. A release builds ALL of them, not the affected set
 * (Themes E1 + F2): `catalog.json` is lockstep — the launcher rejects the whole file when one app's
 * version differs from `runtimeVersion` — so an unchanged bundle left at the previous tag's version
 * could never be listed. Affected-only still decides what a PR builds.
 * @param {string[]} dirs entries of `apps/`
 */
export function allApps(dirs, hasProject) {
  return dirs.filter((d) => hasProject(`apps/${d}`)).sort();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const hasProject = (dir) => existsSync(path.join(repoRoot, dir, 'moon.yml'));
  const { apps = [] } = process.argv.includes('--all')
    ? { apps: allApps(readdirSync(path.join(repoRoot, 'apps')), hasProject) }
    : JSON.parse(await readStdin());
  const matrix = bundleMatrix(apps, hasProject);
  console.log(JSON.stringify(matrix));
}
