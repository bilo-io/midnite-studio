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
    expect(Object.keys(bridge).sort()).toEqual(['db', 'forgeAccounts', 'secrets']);
    expect(Object.keys(bridge.secrets).sort()).toEqual(['has', 'set']);
    expect(Object.keys(bridge.forgeAccounts).sort()).toEqual(['add', 'list', 'remove']);
    expect(Object.keys(bridge.db).sort()).toEqual(['deleteConnection', 'listConnections']);
  });

  it('can reach only the manifest channels over the wire', async () => {
    const wire = ipc();
    const bridge = createVaultBridge(wire);
    await bridge.secrets.has({ key: 'ollama.apiKey' });
    await bridge.secrets.set({ key: 'ollama.apiKey', value: 'x' });
    await bridge.forgeAccounts.list({});
    await bridge.db.listConnections();
    const channels = vi.mocked(wire.invoke).mock.calls.map((c) => c[0]);
    expect(channels).toEqual([CHANNELS.secretsHas, CHANNELS.secretsSet, CHANNELS.forgeAccounts, CHANNELS.dbListConnections]);
    expect(channels).not.toContain(CHANNELS.secretsGet);
  });
});
