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
    out = execFileSync('git', ['grep', '-l', '-E', pattern, '--', 'apps/*/main/*.ts', 'packages/modules/*/main/*.ts'], { cwd: repoRoot, encoding: 'utf8' }).trim();
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
    for (const app of ['agents', 'coder', 'creator', 'gamer', 'media', 'money', 'vault']) {
      // Vault's guest connection moved into its module (Phase 124 Theme D); the rest still live in apps.
      const dirs = app === 'vault' ? ['packages/modules/vault/main/'] : [`apps/${app}/main/`];
      expect(guests.some((f) => dirs.some((d) => f.startsWith(d)))).toBe(true);
    }
  });
});

/*
  Phase 121 Theme I — Agents' pairing identity, one test each, so a later slice cannot widen it quietly.
  Agents is the app that runs other people's prompts through the user's engines, so the thing that proves
  "this socket is Agents" to the vault host is worth a guard of its own: its seed file's mode, the one
  keychain call it makes, and the vault it does not hold.
*/
const AGENTS_PAIRING = 'apps/agents/main/pairing.ts';
const RUNTIME_PAIRING = 'packages/runtime/src/vault/host/pairing.ts';
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe("Agents' pairing identity (Phase 121 Theme I)", () => {
  it('keeps its seed in userData in a user-only file: 0600 file, 0700 directory, nothing looser', async () => {
    const agents = stripComments(await readFile(path.join(repoRoot, AGENTS_PAIRING), 'utf8'));
    // Agents hands the runtime its own userData and nothing else decides where the seed lives.
    expect(agents).toMatch(/pairingIdentitySource\(\{\s*userData,/);
    const runtime = stripComments(await readFile(path.join(repoRoot, RUNTIME_PAIRING), 'utf8'));
    expect(runtime).toMatch(/PAIRING_IDENTITY_FILE = 'vault-pairing\.json'/);
    expect(runtime).toMatch(/writeFileSync\(tmp,[^;]*\{ mode: 0o600 \}\);/);
    expect(runtime).toMatch(/chmodSync\(file, 0o600\)/);
    expect(runtime).toMatch(/mkdirSync\(dirname\(file\), \{ recursive: true, mode: 0o700 \}\)/);
    // No other mode is ever written by the seed's code path.
    const modes = [...runtime.matchAll(/0o[0-7]{3}/g)].map((m) => m[0]);
    expect(modes.every((mode) => mode === '0o600' || mode === '0o700')).toBe(true);
  });

  it('uses safeStorage once, as the cipher of its own pairing seed, and never in a smoke run', async () => {
    const source = await readFile(path.join(repoRoot, AGENTS_PAIRING), 'utf8');
    const code = stripComments(source);
    expect(code.match(/safeStorage/g)?.length).toBe(2); // the import, and the one argument
    expect(code).toMatch(/pairingIdentitySource\(\{[^}]*cipher: safeStorage[^}]*enabled: !smoke[^}]*\}\)/s);
    expect(code).not.toMatch(/encryptString|decryptString|getSelectedStorageBackend|createSecureJsonStore/);
    // Only the pairing module in Agents' main touches it.
    expect(appMainFiles('safeStorage').filter((f) => f.startsWith('apps/agents/'))).toEqual([AGENTS_PAIRING]);
  });

  it('composes no vault: no service, no store, and the one secret it asks the host for is the Ollama key', async () => {
    const files = execFileSync('git', ['ls-files', 'apps/agents/main', 'apps/agents/src'], { cwd: repoRoot, encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    const secretKey = /['"`](?:agent|ollama|finance|media|forge)\.[A-Za-z0-9.<>$_{}-]*(?:apiKey|ApiKey|twelveData)['"`]/g;
    const asked = new Set();
    for (const file of files) {
      const code = stripComments(await readFile(path.join(repoRoot, file), 'utf8'));
      expect(code, file).not.toMatch(/createVaultService|createSecureJsonStore|createSecretsVault|vaultService\b/);
      for (const m of code.matchAll(secretKey)) asked.add(m[0].slice(1, -1));
    }
    expect([...asked]).toEqual(['ollama.apiKey']);
  });
});
