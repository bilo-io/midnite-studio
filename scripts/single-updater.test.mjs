// Phase 113 Theme E (Decision 6) — the launcher owns updates; no app runs its own updater.
//
// The eslint rule (`NO_APP_UPDATER` in eslint.config.mjs) stops the frame, a feature or the
// runtime library from importing electron-updater, and `layer-boundaries.test.mjs` proves that
// rule fires. This test is the other half: it names, repo-wide, every source file that does
// import it, and fails on any file beyond the two allowed. A new package, an `apps/<name>`
// composition, or a path the lint globs do not cover would slip past the rule but not past
// this list.
//
//  - apps/launcher/src/main/updater.ts       — the suite's one updater (runtime + bundles)
//  - packages/desktop/src/main/update-service.ts — Studio's own, until Theme G repoints
//                                                  existing installs at the runtime build
//
// When Theme G lands, the second entry goes, and this test is what says it is gone.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ALLOWED = ['apps/launcher/src/main/updater.ts', 'packages/desktop/src/main/update-service.ts'];

/** Workspace source roots: every `apps/*` and `packages/**` package's src (features nest one deeper). */
const SKIP = new Set(['node_modules', 'dist', 'out', 'build', 'release', 'coverage', '.moon', 'e2e', 'resources']);

async function* sources(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sources(full);
    else if (/\.(c|m)?[jt]sx?$/.test(entry.name) && !/\.test\.[cm]?[jt]sx?$/.test(entry.name)) yield full;
  }
}

const IMPORTS_UPDATER = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]electron-updater(?:\/[^'"]*)?['"]/;

describe('one updater in the suite (Phase 113 Theme E)', () => {
  it('only the launcher and Studio import electron-updater', async () => {
    const found = [];
    for (const top of ['apps', 'packages']) {
      for await (const file of sources(path.join(repoRoot, top))) {
        if (IMPORTS_UPDATER.test(await readFile(file, 'utf8'))) found.push(path.relative(repoRoot, file).split(path.sep).join('/'));
      }
    }
    expect(found.sort()).toEqual([...ALLOWED].sort());
  });
});
