// @vitest-environment node
// vitest, not Playwright: mounting is logic over an injected ipcMain — no browser needed.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { cleanerModuleMain } from '@midnite/studio-module-cleaner/main';
import { monitorModuleMain } from '@midnite/studio-module-monitor/main';
import { vanguardModuleMain } from '@midnite/studio-module-vanguard/main';
import { vaultModuleMain } from '@midnite/studio-module-vault/main';
import { createFileSink } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';

import { registerVanguardHost } from './host';

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'vanguard-host-'));
  const handlers = new Map<string, number>();
  const on = new Set<string>();
  const registered = await registerVanguardHost({
    ipcMain: {
      handle: (c) => void handlers.set(c, (handlers.get(c) ?? 0) + 1),
      on: (c) => void on.add(c),
    },
    trashItem: async () => undefined,
    send: () => undefined,
    userData: dir,
    homeDir: '/Users/someone',
    log: createFileSink({ dir, name: 'vanguard.log', homeDir: '/Users/someone' }),
    runtimeDirectory: join(dir, 'runtime'),
    openPath: async () => '',
    directory: join(dir, 'runtime'),
    pairing: () => null,
    pickDirectory: async () => null,
    onMetricsService: () => undefined,
    openExternal: async () => undefined,
  });
  return { handlers, on, registered };
}

describe('registerVanguardHost', () => {
  it('mounts Vanguard, Vault, Cleaner and Monitor: every module’s channels are registered, each exactly once', async () => {
    const { handlers, on, registered } = await setup();
    const all = new Set([...handlers.keys(), ...on]);
    for (const module of [vanguardModuleMain, vaultModuleMain, cleanerModuleMain, monitorModuleMain]) {
      for (const channel of module.channels) expect(all, `${module.feature}: ${channel}`).toContain(channel);
    }
    // The terminal list is Vanguard's sessions guest's and Monitor's: one handler, not two.
    expect(handlers.get(CHANNELS.terminalList)).toBe(1);
    expect(Math.max(...handlers.values())).toBe(1);
    await registered.shutdown();
  });
});
