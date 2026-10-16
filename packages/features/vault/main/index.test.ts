// @vitest-environment node
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { createFakeCipher, createRecordingContext, createVaultService } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';

import { accountFromKey, vaultMain } from './index';
import { vaultManifest } from '../manifest';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'mstudio-vault-feature-'));
  const vault = createVaultService({ directory: dir, cipher: createFakeCipher() }).forApp('vault');
  const ctx = createRecordingContext();
  vaultMain.register(ctx, { vault });
  return { ctx, vault };
}

describe('vault main', () => {
  it('registers exactly the manifest channels — and never secretsGet', async () => {
    const { ctx } = await setup();
    expect([...ctx.channels].sort()).toEqual([...vaultManifest.ipc].sort());
    expect(ctx.channels).not.toContain(CHANNELS.secretsGet);
  });

  it('sets, reports and clears a secret without ever answering its value', async () => {
    const { ctx } = await setup();
    const key = 'ollama.apiKey';
    expect(await ctx.invoke(CHANNELS.secretsHas, { key })).toEqual({ hasKey: false });
    const reply = await ctx.invoke(CHANNELS.secretsSet, { key, value: 'sk-very-secret' });
    expect(reply).toBeUndefined();
    const has = await ctx.invoke(CHANNELS.secretsHas, { key });
    expect(has).toEqual({ hasKey: true });
    expect(JSON.stringify(has)).not.toContain('sk-very-secret');
    await ctx.invoke(CHANNELS.secretsSet, { key, value: '' });
    expect(await ctx.invoke(CHANNELS.secretsHas, { key })).toEqual({ hasKey: false });
  });

  it('lists forge accounts from entry names (no token) and removes one', async () => {
    const { ctx, vault } = await setup();
    await vault.set('forge-accounts', 'github:github.com:octo', 'ghp_topsecret');
    const list = (await ctx.invoke(CHANNELS.forgeAccounts, {})) as { login: string; hasToken: boolean }[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ login: 'octo', hasToken: true });
    expect(JSON.stringify(list)).not.toContain('ghp_topsecret');
    expect(await ctx.invoke(CHANNELS.forgeAccountRemove, { id: 'github:github.com:octo' })).toEqual({ ok: true });
    expect(await ctx.invoke(CHANNELS.forgeAccounts, {})).toEqual([]);
  });

  it('refuses to add an account without a validator, and lists no connections without a port', async () => {
    const { ctx } = await setup();
    const added = (await ctx.invoke(CHANNELS.forgeAccountAdd, { kind: 'github', host: 'github.com', token: 'x' })) as {
      ok: boolean;
    };
    expect(added.ok).toBe(false);
    expect(await ctx.invoke(CHANNELS.dbListConnections)).toEqual([]);
  });

  it('deletes a saved database password', async () => {
    const { ctx, vault } = await setup();
    await vault.set('db-credentials', 'conn-1', 'pw', { fingerprint: 'f' });
    expect(await ctx.invoke(CHANNELS.dbDeleteConnection, { id: 'conn-1' })).toEqual({ ok: true });
    expect(await vault.has('db-credentials', 'conn-1')).toBe(false);
  });

  it('parses account keys, skipping what is not one', () => {
    expect(accountFromKey('gitlab:gitlab.example.com:me')?.kind).toBe('gitlab');
    expect(accountFromKey('nonsense')).toBeNull();
    expect(accountFromKey('unknown:host:me')).toBeNull();
  });
});
