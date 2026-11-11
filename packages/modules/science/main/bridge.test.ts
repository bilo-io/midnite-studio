// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { CHANNELS } from '@midnite/studio-shared';

import { createScienceBridge, type RendererIpc } from './bridge';

function fakeIpc(): RendererIpc {
  return {
    invoke: vi.fn(async () => ({})),
    send: vi.fn(),
    on: () => undefined,
    removeListener: () => undefined,
  };
}

describe('createScienceBridge', () => {
  it('exposes only science and report', () => {
    const bridge = createScienceBridge(fakeIpc());
    expect(Object.keys(bridge)).toEqual(['science', 'report']);
    expect(Object.keys(bridge.science).sort()).toEqual(['create', 'importStructure', 'list', 'read', 'remove', 'rename', 'write']);
  });

  it('sends every method as an op on the one channel', async () => {
    const ipc = fakeIpc();
    const { science } = createScienceBridge(ipc);
    await science.list();
    await science.read({ id: 'nb-aaaaaaaaaaaa' });
    await science.remove({ id: 'nb-aaaaaaaaaaaa' });
    expect(vi.mocked(ipc.invoke).mock.calls).toEqual([
      [CHANNELS.science, { op: 'list' }],
      [CHANNELS.science, { op: 'read', id: 'nb-aaaaaaaaaaaa' }],
      [CHANNELS.science, { op: 'remove', id: 'nb-aaaaaaaaaaaa' }],
    ]);
  });
});
