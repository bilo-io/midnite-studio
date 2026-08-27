import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { discoverTests } from './discover';
import type { TestsFs } from './fs';

/** An in-memory fixture repo — files are `absPath -> content`, no real disk. */
function fakeFs(files: Record<string, string>): TestsFs {
  return {
    readFile: async (p) => files[p] ?? null,
    exists: async (p) => p in files || Object.keys(files).some((f) => f.startsWith(`${p}/`)),
    listDir: async (dir) => {
      const prefix = `${dir}/`;
      const names = new Set<string>();
      for (const path of Object.keys(files)) {
        if (!path.startsWith(prefix)) continue;
        const rest = path.slice(prefix.length);
        const seg = rest.split('/')[0];
        if (seg) names.add(seg);
      }
      return [...names].map((name) => ({
        name,
        isDirectory: Object.keys(files).some((f) => f.startsWith(`${prefix}${name}/`)),
      }));
    },
  };
}

const ROOT = '/repo';

describe('discoverTests — plain npm package', () => {
  it('finds the root package.json test script with no workspace at all', async () => {
    const fs = fakeFs({
      [join(ROOT, 'package.json')]: JSON.stringify({
        name: 'lonely-pkg',
        scripts: { test: 'jest', build: 'tsc -b' },
      }),
      [join(ROOT, 'jest.config.js')]: 'module.exports = {}',
    });

    const packages = await discoverTests({ repoRoot: ROOT, fs });
    expect(packages).toHaveLength(1);
    expect(packages[0]?.path).toBe('');
    expect(packages[0]?.suites.map((s) => s.name)).toEqual(['test']);
    expect(packages[0]?.suites[0]?.kind).toBe('unit');
    expect(packages[0]?.suites[0]?.run).toEqual({ command: 'npm', args: ['run', 'test'], cwd: ROOT });
  });
});

describe('discoverTests — pnpm workspace', () => {
  it('discovers suites per member package via pnpm-workspace.yaml', async () => {
    const fs = fakeFs({
      [join(ROOT, 'pnpm-lock.yaml')]: '',
      [join(ROOT, 'pnpm-workspace.yaml')]: "packages:\n  - 'packages/*'\n",
      [join(ROOT, 'package.json')]: JSON.stringify({ name: 'root', scripts: {} }),
      [join(ROOT, 'packages/a/package.json')]: JSON.stringify({
        name: '@x/a',
        scripts: { test: 'vitest run', e2e: 'playwright test' },
      }),
      [join(ROOT, 'packages/a/vitest.config.ts')]: '',
      [join(ROOT, 'packages/a/playwright.config.ts')]: '',
      [join(ROOT, 'packages/b/package.json')]: JSON.stringify({
        name: '@x/b',
        scripts: { start: 'node index.js' },
      }),
    });

    const packages = await discoverTests({ repoRoot: ROOT, fs });
    // Package b has no candidate scripts and is dropped entirely.
    expect(packages).toHaveLength(1);
    const a = packages[0];
    expect(a?.path).toBe('packages/a');
    expect(a?.name).toBe('@x/a');
    const kinds = Object.fromEntries(a?.suites.map((s) => [s.name, s.kind]) ?? []);
    expect(kinds).toEqual({ test: 'unit', e2e: 'e2e' });
    expect(a?.suites.find((s) => s.name === 'test')?.run).toEqual({
      command: 'pnpm',
      args: ['run', 'test'],
      cwd: join(ROOT, 'packages/a'),
    });
  });
});

describe('discoverTests — a moon workspace (this repo\'s own shape)', () => {
  it('routes standard tasks through moon and keeps package-only scripts as pnpm', async () => {
    const fs = fakeFs({
      [join(ROOT, '.moon/workspace.yml')]: '',
      [join(ROOT, 'pnpm-lock.yaml')]: '',
      [join(ROOT, 'pnpm-workspace.yaml')]: "packages:\n  - 'packages/*'\n",
      [join(ROOT, 'package.json')]: JSON.stringify({ name: 'root', scripts: {} }),
      [join(ROOT, 'packages/engine/package.json')]: JSON.stringify({
        name: '@midnite/git-engine',
        scripts: { test: 'vitest run', typecheck: 'tsc --noEmit', smoke: 'tsx scripts/smoke.ts' },
      }),
      [join(ROOT, 'packages/engine/moon.yml')]: [
        'tasks:',
        '  typecheck:',
        '    deps:',
        "      - '^:build'",
        '',
      ].join('\n'),
      [join(ROOT, 'packages/engine/vitest.config.ts')]: '',
    });

    const packages = await discoverTests({ repoRoot: ROOT, fs });
    expect(packages).toHaveLength(1);
    const suites = packages[0]?.suites ?? [];
    const byName = Object.fromEntries(suites.map((s) => [s.name, s]));

    expect(byName['test']?.source).toBe('moon.yml');
    expect(byName['test']?.sourceFile).toBe('.moon/tasks/typescript.yml');
    expect(byName['test']?.run).toEqual({
      command: 'moon',
      args: ['run', 'engine:test'],
      cwd: ROOT,
    });

    // typecheck is locally overridden in the package's own moon.yml.
    expect(byName['typecheck']?.sourceFile).toBe('packages/engine/moon.yml');

    // smoke is not one of moon's inherited tasks — stays a plain pnpm script.
    expect(byName['smoke']?.source).toBe('package.json');
    expect(byName['smoke']?.kind).toBe('smoke');
    expect(byName['smoke']?.run.command).toBe('pnpm');
  });
});

describe('discoverTests — no tests at all', () => {
  it('returns no packages when nothing looks test-ish', async () => {
    const fs = fakeFs({
      [join(ROOT, 'package.json')]: JSON.stringify({
        name: 'bare',
        scripts: { start: 'node index.js', build: 'tsc -b' },
      }),
    });

    expect(await discoverTests({ repoRoot: ROOT, fs })).toEqual([]);
  });
});
