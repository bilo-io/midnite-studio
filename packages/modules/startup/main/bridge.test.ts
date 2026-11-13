// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { CHANNELS } from '@midnite/studio-shared';

import { createStartupBridge, type RendererIpc } from './bridge';

function fakeIpc(): RendererIpc {
  return {
    invoke: vi.fn(async () => ({})),
    send: vi.fn(),
    on: () => undefined,
    removeListener: () => undefined,
  };
}

describe('createStartupBridge', () => {
  it('exposes only the startup namespace and Report an Issue, and only their calls', () => {
    const bridge = createStartupBridge(fakeIpc());
    expect(Object.keys(bridge)).toEqual(['startup', 'report']);
    expect(Object.keys(bridge.report).sort()).toEqual(['bundle', 'copy', 'error', 'ghStatus', 'logPath', 'onOpen', 'openUrl', 'reveal', 'submitIssue']);
  });

  it('sends every op over the one channel with its op name', async () => {
    const ipc = fakeIpc();
    const { startup } = createStartupBridge(ipc);
    await startup.get();
    await startup.removeMilestone({ id: '00000000-0000-4000-8000-000000000001' });
    expect(vi.mocked(ipc.invoke).mock.calls).toEqual([
      [CHANNELS.startup, { op: 'get' }],
      [CHANNELS.startup, { op: 'removeMilestone', id: '00000000-0000-4000-8000-000000000001' }],
    ]);
  });

  it('names an op method for every op of the request union', () => {
    const { startup } = createStartupBridge(fakeIpc());
    expect(Object.keys(startup).filter((k) => k !== 'onChanged').length).toBe(24);
  });
});
