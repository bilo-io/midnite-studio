// @vitest-environment node
// vitest, not Playwright: mounting is logic over an injected ipcMain — no browser needed.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { accountantModuleMain } from '@midnite/studio-module-accountant/main';
import { startupModuleMain } from '@midnite/studio-module-startup/main';
import { CHANNELS } from '@midnite/studio-shared';

import { registerStartupHost } from './host';

describe('registerStartupHost', () => {
  it('mounts Startup and Accountant: every declared channel is registered, each exactly once', async () => {
    const handlers = new Map<string, number>();
    const on = new Set<string>();
    const base = mkdtempSync(join(tmpdir(), 'startup-host-'));
    const host = registerStartupHost({
      ipcMain: {
        handle: (c) => void handlers.set(c, (handlers.get(c) ?? 0) + 1),
        on: (c) => void on.add(c),
      },
      trashItem: async () => undefined,
      send: () => undefined,
      userData: join(base, 'userData'),
      appDataBase: join(base, 'appData'),
      pickCsv: async () => null,
      saveCsv: async () => null,
    });
    const all = new Set([...handlers.keys(), ...on]);
    for (const module of [startupModuleMain, accountantModuleMain]) {
      expect(module.channels.length).toBeGreaterThan(0);
      for (const channel of module.channels) expect(all, channel).toContain(channel);
    }
    expect(handlers.get(CHANNELS.startup)).toBe(1);
    expect(handlers.get(CHANNELS.ledger)).toBe(1);
    for (const count of handlers.values()) expect(count).toBe(1);
    await host.dispose();
  });
});
