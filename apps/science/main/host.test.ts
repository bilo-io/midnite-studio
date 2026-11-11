// @vitest-environment node
// vitest, not Playwright: mounting is logic over an injected ipcMain — no browser needed.
import { describe, expect, it } from 'vitest';

import { scienceModuleMain } from '@midnite/studio-module-science/main';

import { registerScienceHost } from './host';

describe('registerScienceHost', () => {
  it('mounts Science: the registered channels equal the module channels, each once', () => {
    const handlers = new Map<string, number>();
    const on = new Set<string>();
    registerScienceHost({
      ipcMain: {
        handle: (c) => void handlers.set(c, (handlers.get(c) ?? 0) + 1),
        on: (c) => void on.add(c),
      },
      trashItem: async () => undefined,
      send: () => undefined,
      userData: '/tmp/science-host-test',
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    });
    expect([...handlers.keys(), ...on].sort()).toEqual([...scienceModuleMain.channels].sort());
    for (const n of handlers.values()) expect(n).toBe(1);
  });
});
