// Phase 113 Theme J — an installable app reads the runtime vault only through the user's grants.
//
// `createVaultService` with no `authorize` allows every app everything: right for Studio (which is
// trusted) and for the runtime's own tests, wrong for any app under `apps/`. Money shipped that
// fallback once and Creator again, each time caught in review. Theme J made "every app's
// `createVaultService` passes an `authorize`" a rule; the shared data plane replaced it with a
// stronger one below — an app composes no vault, and the runtime host's grants decide.

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

/** App main files (tests excluded) matching `pattern`; `git grep` exits 1 on no match, which is `[]`. */
function appMainFiles(pattern) {
  let out = '';
  try {
    out = execFileSync('git', ['grep', '-l', '-E', pattern, '--', 'apps/*/main/*.ts'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch (error) {
    if (error.status !== 1) throw error;
  }
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

/*
  The stronger rule since the shared data plane (docs/APPS.md): an app under `apps/` does not compose a
  vault at all. The runtime host (Studio) holds the one vault and its grants; an app reaches it over the
  host's socket with `connectRuntimeVault`, holds no cipher and passes no `authorize` — the host decides.
  A per-app `createVaultService` would encrypt under that app's own keychain item (unreadable by any
  other app) and race the host on the same files. The launcher is off the graph and has no vault.
*/
/** The one module per app allowed to hold `safeStorage`: its own pairing seed (docs/APPS.md, "Pairing"). */
const PAIRING_MODULE = /^apps\/[a-z-]+\/main\/pairing\.ts$/;

describe('every app main reads the vault through the runtime host, behind its grants', () => {
  it('composes no vault anywhere', async () => {
    const offenders = appMainFiles('createVaultService').filter((f) => !f.startsWith('apps/launcher/'));
    const calls = [];
    for (const file of offenders) {
      const source = await readFile(path.join(repoRoot, file), 'utf8');
      calls.push(`${file}: ${vaultServiceCalls(source).length} createVaultService call(s)`);
    }
    expect(calls).toEqual([]);
  });

  it('touches safeStorage only in its pairing module, and there only to keep its pairing seed', async () => {
    const touching = appMainFiles('safeStorage').filter((f) => !f.startsWith('apps/launcher/'));
    expect(touching.filter((f) => !PAIRING_MODULE.test(f))).toEqual([]);
    for (const file of touching) {
      const source = await readFile(path.join(repoRoot, file), 'utf8');
      // The cipher goes to the runtime's pairing seed and nowhere else: no direct encrypt/decrypt, no vault.
      expect(source, file).toMatch(/pairingIdentitySource\(\{[^}]*cipher: safeStorage/);
      expect(source, file).not.toMatch(/encryptString|decryptString|createVaultService|createSecureJsonStore/);
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code.match(/safeStorage/g)?.length, file).toBe(2); // the import, and the one argument
    }
  });

  it('pairs before it reads: every guest passes its pairing identity to connectRuntimeVault', async () => {
    for (const file of appMainFiles('connectRuntimeVault\\(')) {
      const source = await readFile(path.join(repoRoot, file), 'utf8');
      expect(source, file).toMatch(/connectRuntimeVault\(\{[^}]*identity:/s);
    }
  });

  it('reaches it as a guest in every app that reads a key', () => {
    const guests = appMainFiles('connectRuntimeVault');
    for (const app of ['agents', 'coder', 'creator', 'money', 'vault']) {
      expect(guests.some((f) => f.startsWith(`apps/${app}/main/`))).toBe(true);
    }
  });
});
