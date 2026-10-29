// @vitest-environment node
// vitest, not Playwright: handler registration is logic over an injected ipcMain — no browser needed.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { sessionsManifest } from '@midnite/studio-feature-sessions/main';
import { vanguardManifest } from '@midnite/studio-feature-vanguard/main';
import { createFileSink } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';

import { registerVanguardHandlers } from './context';

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'vanguard-'));
  const handlers = new Map<string, (event: unknown, raw: unknown) => unknown>();
  const on = new Set<string>();
  const registered = await registerVanguardHandlers({
    ipcMain: { handle: (c, l) => void handlers.set(c, l), on: (c) => void on.add(c) },
    trashItem: async () => undefined,
    send: () => undefined,
    userData: dir,
    homeDir: '/Users/someone',
    log: createFileSink({ dir, name: 'vanguard.log', homeDir: '/Users/someone' }),
    runtimeDirectory: join(dir, 'runtime'),
    openPath: async () => '',
  });
  return { handlers, on, registered };
}

describe('registerVanguardHandlers', () => {
  it('registers the vanguard feature’s channels and the sessions guest’s, and no vault or git channel', async () => {
    const { handlers, on, registered } = await setup();
    const all = [...handlers.keys(), ...on];
    for (const channel of vanguardManifest.ipc) expect(all, channel).toContain(channel);
    for (const channel of sessionsManifest.ipc) expect(all, channel).toContain(channel);
    expect(all.some((channel) => channel.startsWith('mstudio:secrets') || channel.startsWith('mstudio:vault'))).toBe(false);
    await registered.shutdown();
  });

  it('starts every enabled sensor at launch: the app autostarts, and reports active', async () => {
    const { handlers, registered } = await setup();
    const status = (await handlers.get(CHANNELS.vanguardSensors)?.({}, undefined)) as { sensors: unknown[]; active: boolean };
    expect(status.active).toBe(true);
    await registered.shutdown();
  });
});
