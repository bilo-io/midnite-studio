// Phase 113 Theme J — an installable app reads the runtime vault only through the user's grants.
//
// `createVaultService` with no `authorize` allows every app everything: right for Studio (which is
// trusted) and for the runtime's own tests, wrong for any app under `apps/`. Money shipped that
// fallback once and Creator again, each time caught in review. This test makes it a rule: every
// `createVaultService(...)` call in an app's main must pass an `authorize` — in practice
// `createVaultGrants({ directory }).authorize`, the file the Vault app edits — so a fresh install
// is denied a key until the user grants it.

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The argument text of each `createVaultService(` call, up to its matching `)`. */
export function vaultServiceCalls(source) {
  const calls = [];
  const re = /createVaultService\s*\(/g;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') depth--;
    }
    calls.push(source.slice(m.index + m[0].length, i - 1));
  }
  return calls;
}

function appMainFiles() {
  const out = execFileSync('git', ['grep', '-l', 'createVaultService', '--', 'apps/*/main/*.ts'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  return out === '' ? [] : out.split('\n').filter((f) => !f.endsWith('.test.ts'));
}

describe('vaultServiceCalls', () => {
  it('finds each call and its full argument, across lines and nested parens', () => {
    const src = `a(); createVaultService({ directory: d, cipher: c }).forApp('x');
      const v = createVaultService({
        directory: join(d, 'x'),
        authorize: grants(d).authorize,
      });`;
    const calls = vaultServiceCalls(src);
    expect(calls).toHaveLength(2);
    expect(calls[0]).not.toContain('authorize');
    expect(calls[1]).toContain('authorize');
  });
});

describe('every app main builds the runtime vault behind the grants', () => {
  it('passes an authorize to each createVaultService call', async () => {
    const files = appMainFiles();
    expect(files.length).toBeGreaterThan(0);
    const offenders = [];
    for (const file of files) {
      const source = await readFile(path.join(repoRoot, file), 'utf8');
      vaultServiceCalls(source).forEach((args, n) => {
        if (!/\bauthorize\b/.test(args)) offenders.push(`${file} (call ${n + 1})`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
