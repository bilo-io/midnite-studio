// @vitest-environment node
// vitest, not Playwright: mounting is logic over an injected ipcMain — no browser needed.
import { describe, expect, it } from 'vitest';

import { healthModuleMain } from '@midnite/studio-module-health/main';

import { registerHealthHost } from './host';

describe('registerHealthHost', () => {
  it('mounts Health: the registered channels equal the module channels, each once', () => {
    const handlers = new Map<string, number>();
    const on = new Set<string>();
    registerHealthHost({
      ipcMain: {
        handle: (c) => void handlers.set(c, (handlers.get(c) ?? 0) + 1),
        on: (c) => void on.add(c),
      },
      trashItem: async () => undefined,
      send: () => undefined,
      userData: '/tmp/health-host-test',
      showSaveDialog: async () => ({ canceled: true }),
    });
    expect([...handlers.keys(), ...on].sort()).toEqual([...healthModuleMain.channels].sort());
    for (const n of handlers.values()) expect(n).toBe(1);
  });
});
