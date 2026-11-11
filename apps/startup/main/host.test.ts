// @vitest-environment node
// vitest, not Playwright: mounting is logic over an injected ipcMain — no browser needed.
import { describe, expect, it } from 'vitest';

import { startupModuleMain } from '@midnite/studio-module-startup/main';

import { registerStartupHost } from './host';

describe('registerStartupHost', () => {
  it('mounts the Startup module: every declared channel is registered, each exactly once', async () => {
    const handlers = new Map<string, number>();
    const on = new Set<string>();
    const host = registerStartupHost({
      ipcMain: {
        handle: (c) => void handlers.set(c, (handlers.get(c) ?? 0) + 1),
        on: (c) => void on.add(c),
      },
      trashItem: async () => undefined,
      send: () => undefined,
    });
    const all = new Set([...handlers.keys(), ...on]);
    for (const channel of startupModuleMain.channels) expect(all, channel).toContain(channel);
    for (const count of handlers.values()) expect(count).toBe(1);
    await host.dispose();
  });
});
