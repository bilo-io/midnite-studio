import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ForgeAccount } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { createForgeAccountsStore, withVaultForgeAccounts } from './forge-accounts-store';

const own: ForgeAccount = {
  id: 'github:github.com:me',
  kind: 'github',
  host: 'github.com',
  login: 'me',
  displayName: 'Me',
  avatarUrl: null,
  addedAt: 5,
  hasToken: false,
  delegated: 'gh',
};

describe('withVaultForgeAccounts', () => {
  it('adds the shared vault’s accounts this app has no record of, and never writes them to its own file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-adopt-'));
    const base = createForgeAccountsStore(dir);
    await base.save({ accounts: [own], activeAccountId: own.id });
    const store = withVaultForgeAccounts(base, async () => [own.id, 'gitlab:gitlab.example.com:you', 'not-an-account']);

    const state = await store.load();
    expect(state.accounts.map((a) => [a.id, a.hasToken])).toEqual([
      [own.id, false],
      ['gitlab:gitlab.example.com:you', true],
    ]);
    expect(state.activeAccountId).toBe(own.id);

    await store.save(state);
    const onDisk = JSON.parse(readFileSync(join(dir, 'forge-accounts.json'), 'utf8')) as { accounts: { id: string }[] };
    expect(onDisk.accounts.map((a) => a.id)).toEqual([own.id]);
  });

  it('makes the first adopted account active when none is, and adds nothing when the vault cannot answer', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-adopt-'));
    const adopted = await withVaultForgeAccounts(createForgeAccountsStore(dir), async () => ['gitlab:gitlab.example.com:you']).load();
    expect(adopted.activeAccountId).toBe('gitlab:gitlab.example.com:you');

    const failing = withVaultForgeAccounts(createForgeAccountsStore(dir), async () => Promise.reject(new Error('no host')));
    expect(await failing.load()).toEqual({ accounts: [], activeAccountId: null });
  });
});
