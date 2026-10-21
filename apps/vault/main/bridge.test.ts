// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { CHANNELS } from '@midnite/studio-shared';

import { createVaultBridge, type RendererIpc } from './bridge';

const ipc = (): RendererIpc => ({
  invoke: vi.fn(async () => 'answer'),
  send: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
});

describe('createVaultBridge', () => {
  it('exposes exactly the metadata and write calls — and no secrets.get', () => {
    const bridge = createVaultBridge(ipc());
    expect(Object.keys(bridge).sort()).toEqual(['db', 'forgeAccounts', 'report', 'secrets', 'vaultGrants', 'vaultPairings', 'webApps']);
    expect(Object.keys(bridge.webApps).sort()).toEqual(['signIns', 'signOut']);
    expect(Object.keys(bridge.vaultPairings).sort()).toEqual(['list', 'unpair']);
    expect(Object.keys(bridge.secrets).sort()).toEqual(['has', 'set']);
    expect(Object.keys(bridge.forgeAccounts).sort()).toEqual(['add', 'list', 'remove']);
    expect(Object.keys(bridge.vaultGrants).sort()).toEqual(['list', 'revoke', 'set']);
    expect(Object.keys(bridge.report).sort()).toEqual(['bundle', 'copy', 'error', 'ghStatus', 'logPath', 'onOpen', 'openUrl', 'reveal', 'submitIssue']);
    expect(Object.keys(bridge.db).sort()).toEqual(['deleteConnection', 'listConnections']);
  });

  it('can reach only the manifest channels over the wire', async () => {
    const wire = ipc();
    const bridge = createVaultBridge(wire);
    await bridge.secrets.has({ key: 'ollama.apiKey' });
    await bridge.secrets.set({ key: 'ollama.apiKey', value: 'x' });
    await bridge.forgeAccounts.list({});
    await bridge.db.listConnections();
    await bridge.vaultGrants.list({});
    const channels = vi.mocked(wire.invoke).mock.calls.map((c) => c[0]);
    expect(channels).toEqual([CHANNELS.secretsHas, CHANNELS.secretsSet, CHANNELS.forgeAccounts, CHANNELS.dbListConnections, CHANNELS.vaultGrantsList]);
    expect(channels).not.toContain(CHANNELS.secretsGet);
  });
});
