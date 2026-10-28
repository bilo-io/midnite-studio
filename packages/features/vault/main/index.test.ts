// @vitest-environment node
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { createFakeCipher, createRecordingContext, createVaultGrants, createVaultService } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';

import { accountFromKey, NEEDS_STUDIO_SIGN_INS, vaultMain } from './index';
import { vaultManifest } from '../manifest';

async function setup(clipboardText = '') {
  const dir = await mkdtemp(join(tmpdir(), 'mstudio-vault-feature-'));
  const service = createVaultService({ directory: dir, cipher: createFakeCipher() });
  const vault = service.forApp('vault');
  const ctx = createRecordingContext();
  const grants = createVaultGrants({ directory: dir });
  let clip = clipboardText;
  const clipboard = {
    writeText: (t: string) => {
      clip = t;
    },
    readText: () => clip,
  };
  vaultMain.register(ctx, { vault, grants, vaultService: service, clipboard });
  return { ctx, vault, grants, service, dir, getClipboard: () => clip };
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

  it('answers "needs Studio" for web-app sign-ins without a port, and signs nobody out', async () => {
    const { ctx } = await setup();
    expect(await ctx.invoke(CHANNELS.webAppsSignIns, {})).toEqual({ available: false, reason: NEEDS_STUDIO_SIGN_INS, apps: [] });
    expect(await ctx.invoke(CHANNELS.webAppsSignOut, { id: 'spotify' })).toEqual({ ok: false, message: NEEDS_STUDIO_SIGN_INS });
  });

  it('passes the sign-in pair to a port when one is composed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mstudio-vault-feature-'));
    const ctx = createRecordingContext();
    const signOuts: string[] = [];
    vaultMain.register(ctx, {
      vault: createVaultService({ directory: dir, cipher: createFakeCipher() }).forApp('vault'),
      grants: createVaultGrants({ directory: dir }),
      webAppSignIns: {
        list: async () => ({ available: true, apps: [{ id: 'spotify', label: 'Spotify', partition: 'persist:app-spotify', cookieCount: 2, origins: ['spotify.com'] }] }),
        signOut: async (id) => {
          signOuts.push(id);
          return { ok: true };
        },
      },
    });
    expect(await ctx.invoke(CHANNELS.webAppsSignIns, {})).toMatchObject({ available: true, apps: [{ cookieCount: 2 }] });
    expect(await ctx.invoke(CHANNELS.webAppsSignOut, { id: 'spotify' })).toEqual({ ok: true });
    expect(signOuts).toEqual(['spotify']);
  });

  it('deletes a saved database password', async () => {
    const { ctx, vault } = await setup();
    await vault.set('db-credentials', 'conn-1', 'pw', { fingerprint: 'f' });
    expect(await ctx.invoke(CHANNELS.dbDeleteConnection, { id: 'conn-1' })).toEqual({ ok: true });
    expect(await vault.has('db-credentials', 'conn-1')).toBe(false);
  });

  it('lists, sets and revokes grants — names only — and refuses to grant a trusted app', async () => {
    const { ctx, vault } = await setup();
    await vault.set('secrets', 'ollama.apiKey', 'sk-never-listed');
    expect(await ctx.invoke(CHANNELS.vaultGrantsList, {})).toEqual({ grants: {}, corrupt: false });
    expect(await ctx.invoke(CHANNELS.vaultGrantSet, { appId: 'browser', namespace: 'secrets', scope: '*' })).toEqual({ ok: true });
    const listed = await ctx.invoke(CHANNELS.vaultGrantsList, {});
    expect(listed).toEqual({ grants: { browser: { secrets: '*' } }, corrupt: false });
    expect(JSON.stringify(listed)).not.toContain('sk-never-listed');
    expect(await ctx.invoke(CHANNELS.vaultGrantRevoke, { appId: 'browser' })).toEqual({ ok: true });
    expect(await ctx.invoke(CHANNELS.vaultGrantsList, {})).toEqual({ grants: {}, corrupt: false });
    // `vault` is not a valid grantee: the request fails validation and answers the fallback.
    expect(await ctx.invoke(CHANNELS.vaultGrantSet, { appId: 'vault', namespace: 'secrets', scope: '*' })).toEqual({ ok: false });
  });

  it('parses account keys, skipping what is not one', () => {
    expect(accountFromKey('gitlab:gitlab.example.com:me')?.kind).toBe('gitlab');
    expect(accountFromKey('nonsense')).toBeNull();
    expect(accountFromKey('unknown:host:me')).toBeNull();
  });

  it('manages vault lock state and answers lock status', async () => {
    const { ctx } = await setup();
    const status = (await ctx.invoke(CHANNELS.vaultLockStatus)) as { locked: boolean };
    expect(status.locked).toBe(false);

    expect(await ctx.invoke(CHANNELS.vaultLock)).toEqual({ ok: true });
    const lockedStatus = (await ctx.invoke(CHANNELS.vaultLockStatus)) as { locked: boolean };
    expect(lockedStatus.locked).toBe(true);

    expect(await ctx.invoke(CHANNELS.vaultUnlock, {})).toEqual({ ok: true });
    const unlockedStatus = (await ctx.invoke(CHANNELS.vaultLockStatus)) as { locked: boolean };
    expect(unlockedStatus.locked).toBe(false);
  });

  it('reads audit log and verifies audit chain', async () => {
    const { ctx, vault } = await setup();
    await vault.set('secrets', 'k', 'v');

    const auditList = (await ctx.invoke(CHANNELS.vaultAuditList, { limit: 10 })) as {
      entries: unknown[];
      valid: boolean;
      total: number;
    };
    expect(auditList.valid).toBe(true);
    expect(auditList.total).toBeGreaterThan(0);

    const auditVerify = (await ctx.invoke(CHANNELS.vaultAuditVerify)) as { valid: boolean; total: number };
    expect(auditVerify.valid).toBe(true);
    expect(auditVerify.total).toBeGreaterThan(0);
  });

  it('revealOnce returns revealed secret value and logs audit', async () => {
    const { ctx, vault } = await setup();
    await vault.set('secrets', 'ollama.apiKey', 'ollama-secret-123');
    const res = await ctx.invoke(CHANNELS.vaultRevealOnce, { namespace: 'secrets', key: 'ollama.apiKey' });
    expect(res).toEqual({ ok: true, revealed: 'ollama-secret-123' });
  });

  it('copyOnce writes secret directly to clipboard and auto-clears', async () => {
    const { ctx, vault, getClipboard } = await setup();
    await vault.set('secrets', 'ollama.apiKey', 'ollama-secret-123');
    const res = await ctx.invoke(CHANNELS.vaultCopyOnce, { namespace: 'secrets', key: 'ollama.apiKey' });
    expect(res).toEqual({ ok: true, timeoutSeconds: 30 });
    expect(getClipboard()).toBe('ollama-secret-123');
  });
});
