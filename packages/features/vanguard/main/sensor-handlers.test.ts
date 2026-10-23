// @vitest-environment node
import { mkdtempSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FeatureMainContext } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { registerSensorHandlers } from './sensor-handlers';
import { createVanguardService } from './vanguard-service';

async function setup(opened = false, record?: (f: unknown) => Promise<never>) {
  const dir = mkdtempSync(join(tmpdir(), 'vg-'));
  const run = vi.fn();
  const service = await createVanguardService({
    userData: dir,
    runProcess: async () => ({ ok: false, reason: 'failed', hint: '' }),
    record:
      record ??
      (async () => {
        throw new Error('unused');
      }),
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

  it('answers the malware status with the engines and runs an on-demand folder scan into the ledger', async () => {
    const recorded: Record<string, unknown>[] = [];
    const { bare, typed, dir } = await setup(false, async (f) => (recorded.push(f as Record<string, unknown>), f as never));
    const status = (await bare.get(CHANNELS.vanguardMalwareStatus)!()) as { engines: { id: string; installed: boolean }[] };
    expect(status.engines.find((e) => e.id === 'builtin')?.installed).toBe(true);

    const target = join(dir, 'scan-me');
    mkdirSync(target);
    writeFileSync(join(target, 'package.json'), '{"scripts":{"postinstall":"node setup_bun.js"}}');
    const result = (await typed.get(CHANNELS.vanguardMalwareScan)!({ target: 'folder', path: target })) as {
      ok: boolean;
      value?: { detections: number };
    };
    expect(result.ok).toBe(true);
    expect(result.value?.detections).toBe(1);
    expect(recorded[0]).toMatchObject({ category: 'malware', source: 'vanguard' });
    expect(String(recorded[0]?.['fingerprint'])).toContain('ShaiHulud_Setup_Bun');
  });

  it('answers a bad scan request with an error result, never a throw', async () => {
    const { typed } = await setup();
    expect(await typed.get(CHANNELS.vanguardMalwareScan)!({ target: 'folder', path: 'relative' })).toEqual({
      ok: false,
      kind: 'error',
      message: 'Choose a folder to scan.',
    });
    expect(() => typed.get(CHANNELS.vanguardMalwareScan)!({ target: 'everything' })).toThrow();
  });
});
