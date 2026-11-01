// Phase 113 Theme F item 3 — every midnite surface wears Damion, never Quick Kiss. Plain vitest: no
// browser capability needed; `git ls-files`/`git grep` keep it fast under a loaded gate (no directory
// walk).
//
// Studio (apps/studio + its renderer, packages/app) was once exempt; it ships publicly too, so it
// moved to Damion and the exemption went with it. The check looks for the font ASSET and for
// references to its file, not the `--font-brand` variable name, which every surface defines for Damion.

import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findQuickKiss } from './no-quick-kiss.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch (error) {
    if (error.status === 1) return []; // git grep: no match
    throw error;
  }
};

const SURFACES = ['apps', 'packages'];
// The guard itself names the font as the thing it forbids.
const NOT_SURFACES = [':!scripts/no-quick-kiss.mjs', ':!scripts/no-quick-kiss.test.mjs'];

describe('no midnite surface ships Quick Kiss', () => {
  it('has no quick-kiss font file in any public surface', () => {
    const files = git('ls-files', '--cached', '--others', '--exclude-standard', '--', ...SURFACES, ...NOT_SURFACES);
    expect(files.filter((f) => /quick[-_ ]?kiss/i.test(f))).toEqual([]);
  });

  it('never references the font file (url, import or path) outside comments and docs', () => {
    // Prose may name the face (the launcher/site CSS explain why they use Damion); a reference
    // is a `url(...)`, an import, or a path to the .ttf.
    const hits = git('grep', '--untracked', '-n', '-i', '-E', "quick[-_ ]?kiss[^'\"\\s)]*\\.(ttf|otf|woff2?)", '--', ...SURFACES, ...NOT_SURFACES)
      // the website guard test and docs name the filename as a forbidden string
      .filter((l) => !/\.test\.[cm]?[jt]sx?:/.test(l) && !/\.(md|css):\d+:\s*(\/?\*|\/\/|\*)/.test(l) && !/^\S+\.(css|tsx?|md):\d+:\s*(\*|\/\/|\/\*)/.test(l));
    expect(hits).toEqual([]);
  });

  it('Studio, the launcher and the website each declare a Damion @font-face', () => {
    for (const css of [
      'packages/app/src/styles.css',
      'apps/launcher/src/renderer/styles.css',
      'packages/website/src/styles/site.css',
    ]) {
      const text = execFileSync('git', ['show', `:${css}`], { cwd: repoRoot, encoding: 'utf8' });
      expect(text, css).toMatch(/@font-face\s*{[^}]*font-family:\s*['"]?Damion/);
    }
  });
});

describe('findQuickKiss (packaged-output guard)', () => {
  it('finds the font anywhere in a bundle tree and passes a clean one', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'no-quick-kiss-'));
    try {
      await mkdir(path.join(dir, 'Contents/Resources/assets'), { recursive: true });
      await writeFile(path.join(dir, 'Contents/Resources/assets/Damion-latin.woff2'), 'x');
      expect(await findQuickKiss(dir)).toEqual([]);
      const bad = path.join(dir, 'Contents/Resources/assets/quick-kiss-abc123.ttf');
      await writeFile(bad, 'x');
      expect(await findQuickKiss(dir)).toEqual([bad]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
