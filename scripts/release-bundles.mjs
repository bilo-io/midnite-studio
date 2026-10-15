#!/usr/bin/env node
// release-bundles — which app bundles does a release build? (Phase 113 Theme F1)
//
// A release always builds the runtime (Studio) and the launcher. A per-app bundle is built only when
// `scripts/affected-apps.mjs` (moon's affected projects mapped through `app-*` tags) names it AND the app
// has a moon project of its own (`apps/<id>/moon.yml`) — Studio and the launcher are built by their own
// `dist` tasks, and an app id from the placement map that has not been extracted yet has nothing to build.
//
// Usage: node scripts/affected-apps.mjs --base <prev-tag> --json | node scripts/release-bundles.mjs
// Prints the matrix JSON a workflow feeds to `strategy.matrix`: {"include":[{"app","project","dir"}]}.
import { existsSync } from 'node:fs';
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { apps = [] } = JSON.parse(await readStdin());
  const matrix = bundleMatrix(apps, (dir) => existsSync(path.join(repoRoot, dir, 'moon.yml')));
  console.log(JSON.stringify(matrix));
}
