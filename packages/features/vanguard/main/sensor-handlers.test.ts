// @vitest-environment node
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FeatureMainContext } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { registerSensorHandlers } from './sensor-handlers';
import { createVanguardService } from './vanguard-service';

async function setup(opened = false) {
  const dir = mkdtempSync(join(tmpdir(), 'vg-'));
  const run = vi.fn();
  const service = await createVanguardService({
    userData: dir,
    runProcess: async () => ({ ok: false, reason: 'failed', hint: '' }),
    record: async () => {
      throw new Error('unused');
    },
    autostart: 'after-view-opened',
    onChanged: () => undefined,
    sensors: [{ id: 's', label: 'S', description: 'd', schedule: { kind: 'none' }, run }],
  });
  if (opened) await service.host.viewOpened();
  const bare = new Map<string, () => unknown>();
  const typed = new Map<string, (payload: unknown) => unknown>();
  const ctx = {
    ipc: {
      handleBare: (c: string, h: () => unknown) => void bare.set(c, h),
      handle: (c: string, schema: { parse: (v: unknown) => unknown }, h: (p: unknown) => unknown) =>
        void typed.set(c, (p) => h(schema.parse(p))),
      send: () => undefined,
    },
    emit: () => undefined,
    trashItem: async () => undefined,
  } as unknown as FeatureMainContext;
  const openPath = vi.fn(async () => undefined);
  registerSensorHandlers(ctx, { service: () => service, openPath });
  return { service, bare, typed, run, openPath, dir };
}

describe('sensor handlers', () => {
  it('starts nothing in Studio until the view is opened once, then persists that', async () => {
    const { service, bare, run } = await setup();
    await service.host.start();
    expect(run).not.toHaveBeenCalled();
    const status = (await bare.get(CHANNELS.vanguardViewOpened)!()) as { active: boolean };
    expect(status.active).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(service.settings.get().viewOpened).toBe(true);
  });

  it('applies a settings patch: switching a sensor off stops it', async () => {
    const { service, typed } = await setup(true);
    await service.host.start();
    expect(service.host.status().sensors[0]?.state).toBe('idle');
    await typed.get(CHANNELS.vanguardSettingsSet)!({ sensors: { s: false } });
    expect(service.host.status().sensors[0]).toMatchObject({ state: 'disabled', enabled: false });
  });

  it('refuses an out-of-range cadence at the schema', async () => {
    const { typed } = await setup();
    expect(() => typed.get(CHANNELS.vanguardSettingsSet)!({ cadenceSeconds: 1 })).toThrow();
  });

  it('creates and opens the quarantine folder', async () => {
    const { bare, openPath, service } = await setup();
    const result = await bare.get(CHANNELS.vanguardOpenQuarantine)!();
    expect(result).toEqual({ ok: true });
    expect(existsSync(service.quarantineDir)).toBe(true);
    expect(openPath).toHaveBeenCalledWith(service.quarantineDir);
  });

  it('serves the network sensor’s last snapshot', async () => {
    const { bare, service } = await setup();
    expect(await bare.get(CHANNELS.vanguardConnections)!()).toEqual({ at: null, active: false, connections: [] });
    service.connections.set({ at: 7, active: true, connections: [] });
    expect(await bare.get(CHANNELS.vanguardConnections)!()).toEqual({ at: 7, active: true, connections: [] });
  });
});
