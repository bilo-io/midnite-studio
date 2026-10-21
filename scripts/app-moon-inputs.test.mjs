// Phase 113 — an app's `typecheck` and `test` re-run when its main half changes.
//
// Every app under `apps/` with a `main/` folder typechecks and tests that folder, and the feature main
// halves and runtime it bundles. moon only re-runs a task when one of its declared inputs moves, so an
// input list that names `src/**` alone replays a cached green after a change to `main/` — the gate then
// passes on code it never ran. The build task already lists the right files; this test holds
// `typecheck` and `test` to the same main-side inputs.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The `inputs:` entries of one task in a moon.yml, read as plain text (the files are simple). */
export function taskInputs(yml, task) {
  const block = new RegExp(`\\n  ${task}:\\n((?:    [^\\n]*\\n|\\n)*)`).exec(yml)?.[1] ?? '';
  const inputs = /    inputs:\n((?:      - [^\n]*\n)+)/.exec(block)?.[1] ?? '';
  return inputs
    .split('\n')
    .map((line) => /- '([^']+)'/.exec(line)?.[1])
    .filter(Boolean);
}

const isMainSide = (input) =>
  input === 'main/**/*' || input === '/packages/runtime/src/**/*' || /^\/packages\/features\/[^/]+\/main\/\*\*\/\*$/.test(input);

const apps = readdirSync(path.join(repoRoot, 'apps')).filter(
  (dir) => existsSync(path.join(repoRoot, 'apps', dir, 'main')) && existsSync(path.join(repoRoot, 'apps', dir, 'moon.yml')),
);

describe('app moon inputs', () => {
  it('finds the apps with a main half', () => {
    expect(apps.length).toBeGreaterThan(0);
  });

  it.each(apps)('apps/%s typechecks and tests on every main-side input its build has', (app) => {
    const yml = readFileSync(path.join(repoRoot, 'apps', app, 'moon.yml'), 'utf8');
    const wanted = taskInputs(yml, 'build').filter(isMainSide);
    expect(wanted).toContain('main/**/*');
    for (const task of ['typecheck', 'test']) {
      const have = taskInputs(yml, task);
      expect({ task, missing: wanted.filter((input) => !have.includes(input)) }).toEqual({ task, missing: [] });
    }
  });
});
