// Phase 113 Theme O — the suites that can reach `gh` run with it logged out.
//
// `vitest-isolate-gh.mjs` points gh at an empty config dir and clears the token variables. This
// proves it does, here (the root suite loads it too), and holds every vitest config of a package
// whose own code spawns `gh` to loading it — a new spawner without the guard fails here, not on
// a public repo.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Package dirs whose non-test source names `gh` and starts a process. `shared` (zod only) and the
 * `app` renderer cannot spawn by the layer rules, so a `'gh'` there is a value, not a command.
 */
function ghSpawningPackages() {
  const out = execFileSync('git', ['grep', '-l', "'gh'", '--', 'packages', 'apps'], { cwd: repoRoot, encoding: 'utf8' });
  const dirs = new Set();
  for (const file of out.trim().split('\n')) {
    if (/\.test\.|\/e2e\/|\/test-support\//.test(file)) continue;
    if (/^packages\/(shared|app)\//.test(file)) continue;
    if (!/\b(spawn|execFile|runProcess)\(/.test(readFileSync(path.join(repoRoot, file), 'utf8'))) continue;
    const parts = file.split('/');
    const dir = parts[0] === 'packages' && parts[1] === 'features' ? parts.slice(0, 3) : parts.slice(0, 2);
    const candidate = dir.join('/');
    if (readdirSync(path.join(repoRoot, candidate)).includes('vitest.config.ts')) dirs.add(candidate);
  }
  return [...dirs];
}

describe('the gh isolation setup', () => {
  it('leaves gh logged out in this worker', () => {
    expect(process.env.GH_CONFIG_DIR?.startsWith(path.join(tmpdir(), 'midnite-test-gh-'))).toBe(true);
    for (const name of ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN']) {
      expect(process.env[name]).toBeUndefined();
    }
  });

  it('is loaded by every suite whose package spawns gh', () => {
    const packages = ghSpawningPackages();
    expect(packages).toContain('packages/features/forge');
    const missing = packages.filter(
      (dir) => !readFileSync(path.join(repoRoot, dir, 'vitest.config.ts'), 'utf8').includes('vitest-isolate-gh.mjs'),
    );
    expect(missing).toEqual([]);
  });
});
