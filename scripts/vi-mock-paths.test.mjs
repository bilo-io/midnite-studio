// Phase 113 — every relative `vi.mock` names a module that exists.
//
// A `vi.mock('./moved-module')` whose target has moved does not fail: vitest registers a mock for a
// path nobody imports, and the test then runs the real module. While features were being moved out
// of `packages/app` and `packages/desktop`, exactly that let a test run the real `createAppIssue`
// and open a public GitHub issue. This walks every test file and fails on a relative mock path that
// resolves to nothing.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOCK = /vi\.(?:mock|doMock)\(\s*['"](\.{1,2}\/[^'"]+)['"]/g;
const EXTENSIONS = ['', '.ts', '.tsx', '.mjs', '.js', '.cjs'];

const isFile = (p) => existsSync(p) && statSync(p).isFile();

/** Whether a relative specifier, as written in `fromFile`, resolves to a module on disk. */
export function resolvesToModule(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    ...EXTENSIONS.map((ext) => base + ext),
    ...['index.ts', 'index.tsx', 'index.js'].map((name) => path.join(base, name)),
    // TS ESM style: `./x.js` naming `x.ts`.
    ...(base.endsWith('.js') ? [`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.tsx`] : []),
  ];
  return candidates.some(isFile);
}

describe('vi.mock paths', () => {
  it('resolves a moved module as missing, and a present one as found', () => {
    const here = fileURLToPath(import.meta.url);
    expect(resolvesToModule(here, './vi-mock-paths.test.mjs')).toBe(true);
    expect(resolvesToModule(here, './no-such-module')).toBe(false);
  });

  it('every relative vi.mock in the repo names a module that exists', () => {
    const files = execFileSync('git', ['ls-files', '*.test.ts', '*.test.tsx', '*.test.mjs'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .trim()
      .split('\n');
    const stale = [];
    for (const file of files) {
      const abs = path.join(repoRoot, file);
      for (const match of readFileSync(abs, 'utf8').matchAll(MOCK)) {
        if (!resolvesToModule(abs, match[1])) stale.push(`${file}: ${match[1]}`);
      }
    }
    expect(stale).toEqual([]);
  });
});
