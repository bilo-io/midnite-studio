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
//  - packages/desktop/src/main/update-service.ts — Studio's legacy self-updater (Theme G3). It
//    stays only as the fallback for an install with no Midnite Apps launcher: once the launcher
//    is installed, `updates/update-handover.ts` switches it off and the launcher owns updates.
//    It goes when the `midnite-studio/feed` is retired; this test is what says it is gone.

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ALLOWED = ['apps/launcher/src/main/updater.ts', 'packages/desktop/src/main/update-service.ts'];

const IMPORTS_UPDATER = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]electron-updater(?:\/[^'"]*)?['"]/;

/**
 * Tracked source files that mention electron-updater at all — `git grep` narrows thousands of
 * files to a handful in milliseconds (a directory walk timed out under a loaded gate), then the
 * import pattern decides. `--untracked` sees a new file before it is added; ignored paths
 * (node_modules, build output) are skipped for free.
 */
function candidates() {
  try {
    const out = execFileSync('git', ['grep', '--untracked', '-l', '-F', 'electron-updater', '--', 'apps', 'packages'], { cwd: repoRoot, encoding: 'utf8' });
    return out.split('\n').filter((f) => /\.(c|m)?[jt]sx?$/.test(f) && !/\.test\.[cm]?[jt]sx?$/.test(f));
  } catch (error) {
    if (error.status === 1) return []; // git grep: no match
    throw error;
  }
}

describe('one updater in the suite (Phase 113 Theme E)', () => {
  it('only the launcher and Studio import electron-updater', async () => {
    const found = [];
    for (const file of candidates()) {
      if (IMPORTS_UPDATER.test(await readFile(path.join(repoRoot, file), 'utf8'))) found.push(file);
    }
    expect(found.sort()).toEqual([...ALLOWED].sort());
  }, 30_000);
});
