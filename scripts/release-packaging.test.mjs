// Two ways `moon run desktop:dist` stopped packaging on main, both found by the V8 release dry run
// (Phase 113, 2026-10-17) rather than by any gate — the gate never packages. Each guard reads the
// files that decide it, so it fails here, in seconds, instead of in the release workflow.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const featuresDir = path.join(repo, 'packages/features');

describe('release packaging', () => {
  // electron-builder walks a production dependency into the asar pass, and a workspace package lives
  // outside packages/desktop ("…/dist/.tsbuildinfo must be under packages/desktop/"). esbuild inlines
  // every workspace import into dist/bundle, so none of them is needed at runtime.
  it('desktop takes every workspace package as a devDependency, never a dependency', () => {
    const pkg = JSON.parse(readFileSync(path.join(repo, 'packages/desktop/package.json'), 'utf8'));
    const workspaceDeps = Object.keys(pkg.dependencies ?? {}).filter((name) => name.startsWith('@midnite/'));
    expect(workspaceDeps).toEqual([]);
  });

  // The inherited `build` is `tsc -b` with `outputs: dist`. A feature with no main half emits nothing,
  // so moon fails it on missing outputs — and `app:build` → `desktop:dist` depends on it.
  it('a feature with no main half overrides the inherited build', () => {
    const rendererOnly = readdirSync(featuresDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !existsSync(path.join(featuresDir, entry.name, 'main')))
      .map((entry) => entry.name);
    const missing = rendererOnly.filter((name) => {
      const moonYml = readFileSync(path.join(featuresDir, name, 'moon.yml'), 'utf8');
      return !/^ {2}build:\n(?: {4}.*\n)*? {4}command: 'noop'/m.test(moonYml);
    });
    expect(missing).toEqual([]);
  });
});
