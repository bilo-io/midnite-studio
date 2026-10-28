import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CANARY_RELATIVE_PATH } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFakeCipher, type FakeCipher } from '../vault/testing';
import { createVaultService, VAULT_NAMESPACES, type VaultClient } from '../vault/vault-service';
import { canaryPath, createOutboundSecretSource, ensureCanaries } from './canary';

let dir: string;
let home: string;
let cipher: FakeCipher;
let vault: VaultClient;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mstudio-canary-vault-'));
  home = await mkdtemp(join(tmpdir(), 'mstudio-canary-home-'));
  cipher = createFakeCipher();
  vault = createVaultService({ directory: dir, cipher }).forApp('studio');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

const seeded = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) % 251);

describe('ensureCanaries', () => {
  it('writes two shaped values to the vault and a 0600 file where an agent shell can reach it', async () => {
    const state = await ensureCanaries({ vault, homeDir: home, random: seeded });
    expect(state).not.toBeNull();
    expect(state!.path).toBe(join(home, CANARY_RELATIVE_PATH));
    expect(state!.values.githubPat).toMatch(/^ghp_[A-Za-z0-9]{36}$/);
    expect(state!.values.awsKey).toMatch(/^AKIA[A-Z2-7]{16}$/);
    expect(((await stat(state!.path)).mode & 0o777).toString(8)).toBe('600');
    const file = await readFile(state!.path, 'utf8');
    expect(file).toContain(state!.values.githubPat);
    expect(file).toContain(state!.values.awsKey);
    expect(await vault.keys('canaries')).toHaveLength(2);
    expect(VAULT_NAMESPACES.canaries.fileName).toBe('canaries.vault.json');
  });

  it('is idempotent: a second call keeps the values, and restores a deleted file and its mode', async () => {
    const first = await ensureCanaries({ vault, homeDir: home });
    await rm(canaryPath(home));
    const second = await ensureCanaries({ vault, homeDir: home });
    expect(second!.values).toEqual(first!.values);
    expect(await readFile(canaryPath(home), 'utf8')).toContain(first!.values.githubPat);
    await writeFile(canaryPath(home), 'tampered', { mode: 0o644 });
    await ensureCanaries({ vault, homeDir: home });
    expect(await readFile(canaryPath(home), 'utf8')).toContain(first!.values.awsKey);
    expect(((await stat(canaryPath(home))).mode & 0o777).toString(8)).toBe('600');
  });

  it('plants nothing when the vault cannot hold the values', async () => {
    cipher.setAvailable(false);
    // The canaries namespace holds for the session when encryption is unavailable, but a locked or
    // unavailable vault must not be asked: no file is written for a value that would not survive.
    const state = await ensureCanaries({ vault, homeDir: home });
    expect(state).toBeNull();
    await expect(stat(canaryPath(home))).rejects.toThrow();
  });
});

describe('createOutboundSecretSource', () => {
  it('lists every vault value, labels the canaries, and leaves out short ones', async () => {
    await vault.set('secrets', 'agent.claude.apiKey', 'sk-ant-long-enough-value-1234');
    await vault.set('secrets', 'short', 'tiny');
    await vault.set('forge-accounts', 'github:github.com:me', 'ghp_forge_token_value_123456');
    await ensureCanaries({ vault, homeDir: home });
    const secrets = await createOutboundSecretSource({ vault })();
    const byName = Object.fromEntries(secrets.map((s) => [s.name, s]));
    expect(byName['secrets:agent.claude.apiKey']).toMatchObject({ value: 'sk-ant-long-enough-value-1234', kind: 'vault' });
    expect(byName['forge-accounts:github:github.com:me']?.kind).toBe('vault');
    expect(byName['secrets:short']).toBeUndefined();
    expect(secrets.filter((s) => s.kind === 'canary')).toHaveLength(2);
  });

  it('reuses a read within its ttl and re-reads after', async () => {
    let t = 0;
    const source = createOutboundSecretSource({ vault, ttlMs: 1000, now: () => t });
    await vault.set('secrets', 'a', 'first-value-that-is-long');
    expect(await source()).toHaveLength(1);
    await vault.set('secrets', 'b', 'second-value-that-is-long');
    expect(await source()).toHaveLength(1);
    t = 1500;
    expect(await source()).toHaveLength(2);
  });
});
