// @vitest-environment node
import { ok, SFX_LICENCE_SHA256, SfxSidecarSchema, type SfxProgressEvent, type SfxStatus } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import type { SfxInstaller } from './installer';
import { createSfxService, sfxStem, unavailableSfx, type SfxServiceDeps } from './sfx-service';

const consent = { licenceSha256: SFX_LICENCE_SHA256, revenueAcknowledged: true as const, acceptedAt: '2026-11-01T00:00:00.000Z' };

function fakeInstaller(state: SfxStatus['state'], withConsent = true): SfxInstaller {
  return {
    status: vi.fn(async () => ({ state, consent: withConsent ? consent : null, bytesOnDisk: 0, totalBytes: 1 })),
    consent: vi.fn(async () => ok({ state, consent, bytesOnDisk: 0, totalBytes: 1 })),
    revokeConsent: vi.fn(async () => ok({ state, consent: null, bytesOnDisk: 0, totalBytes: 1 })),
    install: vi.fn(async () => ok({ state: 'installed', consent, bytesOnDisk: 1, totalBytes: 1 })),
    cancel: vi.fn(() => ok()),
    uninstall: vi.fn(async () => ok({ state: 'not-installed', consent, bytesOnDisk: 0, totalBytes: 1 })),
    assetPath: vi.fn((p: string) => `/models/${p}`),
  } as unknown as SfxInstaller;
}

function setup(overrides: Partial<SfxServiceDeps> = {}, state: SfxStatus['state'] = 'installed', withConsent = true) {
  const writes: Array<{ path: string; data: Buffer; project: string; tab: string }> = [];
  const events: SfxProgressEvent[] = [];
  const run = vi.fn<SfxServiceDeps['run']>(async (_req, opts) => {
    opts.onStage('sampling', 0.5);
    return { channels: [new Float32Array(441), new Float32Array(441)], sampleRate: 44_100 };
  });
  const deps: SfxServiceDeps = {
    installer: fakeInstaller(state, withConsent),
    run,
    writeBytes: async (req) => {
      writes.push(req);
      return ok();
    },
    emit: (e) => events.push(e),
    disposeEngine: vi.fn(),
    now: () => new Date(2026, 10, 1, 17, 30, 0),
    randomSeed: () => 1234,
    ...overrides,
  };
  return { service: createSfxService(deps), deps, writes, events, run };
}

const request = { generationId: 'g1', repoId: 'r1', project: 'blasters', prompt: 'Laser zap!' };

describe('sfxStem', () => {
  it('is slug, settings and timestamp', () => {
    expect(sfxStem('Laser zap!', '3s-s1234', new Date(2026, 10, 1, 17, 30, 0))).toBe('laser-zap-3s-s1234-20261101-173000');
  });
});

describe('SFX service — generate', () => {
  it('writes a wav and a sidecar per take, with the settings in the file name', async () => {
    const { service, writes, run } = setup();
    const result = await service.generate({ ...request, options: { seconds: 2 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.takes).toEqual([{ file: 'laser-zap-2s-s1234-20261101-173000.wav', sidecar: 'laser-zap-2s-s1234-20261101-173000.json', seed: 1234, seconds: 2 }]);
    expect(run.mock.calls[0]![0]).toEqual({ assetsDir: '/models/', take: { prompt: 'Laser zap!', negativePrompt: '', seconds: 2, steps: 8, cfgScale: 1, seed: 1234 } });
    expect(writes.map((w) => [w.tab, w.project, w.path])).toEqual([
      ['sfx', 'blasters', 'laser-zap-2s-s1234-20261101-173000.wav'],
      ['sfx', 'blasters', 'laser-zap-2s-s1234-20261101-173000.json'],
    ]);
    expect(writes[0]!.data.toString('ascii', 0, 4)).toBe('RIFF');
    const sidecar = SfxSidecarSchema.parse(JSON.parse(writes[1]!.data.toString('utf8')));
    expect(sidecar).toMatchObject({ kind: 'sfx', file: 'laser-zap-2s-s1234-20261101-173000.wav', prompt: 'Laser zap!', seed: 1234, steps: 8, cfgScale: 1, sampleRate: 44_100, channels: 2 });
    expect(sidecar.negativePrompt).toBeUndefined();
  });

  it('runs variations on consecutive seeds and reports one overall fraction that only grows', async () => {
    const { service, run, events } = setup();
    const result = await service.generate({ ...request, name: 'zap', options: { variations: 3, seed: 10 } });
    expect(result.ok && result.value.takes.map((t) => t.seed)).toEqual([10, 11, 12]);
    expect(run.mock.calls.map((c) => c[0].take.seed)).toEqual([10, 11, 12]);
    const fractions = events.flatMap((e) => (e.kind === 'generate' && e.fraction !== undefined ? [e.fraction] : []));
    for (let i = 1; i < fractions.length; i += 1) expect(fractions[i]!).toBeGreaterThanOrEqual(fractions[i - 1]!);
    expect(events.at(-1)).toMatchObject({ kind: 'generate', status: 'succeeded', fraction: 1, files: expect.arrayContaining([expect.stringMatching(/^zap-/)]) });
  });

  it('keeps the negative prompt in the sidecar only when guidance uses it', async () => {
    const { service, writes } = setup();
    await service.generate({ ...request, options: { cfgScale: 3, negativePrompt: 'music', seed: 1 } });
    expect(JSON.parse(writes[1]!.data.toString('utf8')).negativePrompt).toBe('music');
    expect(writes[0]!.path).toContain('cfg3-neg-s1');
  });

  it('refuses before consent, before install, and when the runtime is missing — never touching the engine', async () => {
    for (const [args, message] of [
      [[{}, 'installed', false], /Accept the Stability AI Community License/],
      [[{}, 'not-installed'], /not installed/],
      [[{ runtimeAvailable: () => false }, 'installed'], /no ONNX runtime/],
    ] as const) {
      const { service, run } = setup(...(args as unknown as Parameters<typeof setup>));
      const result = await service.generate(request);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.kind === 'error' && result.message).toMatch(message);
      expect(run).not.toHaveBeenCalled();
    }
  });

  it('turns a cancel into a cancelled result and event, and a worker error into a failed one', async () => {
    let release: () => void = () => undefined;
    const { service, events } = setup({
      run: (_req, opts) =>
        new Promise((_resolve, reject) => {
          release = () => reject(new Error('cancelled'));
          opts.signal.addEventListener('abort', () => release());
        }),
    });
    const pending = service.generate(request);
    await vi.waitFor(() => expect(events.length).toBeGreaterThan(0));
    expect(service.cancelGenerate('g1').ok).toBe(true);
    const result = await pending;
    expect(!result.ok && result.kind === 'error' && result.message).toBe('cancelled');
    expect(events.at(-1)).toMatchObject({ status: 'cancelled' });
    expect(service.cancelGenerate('g1').ok).toBe(false);

    const failing = setup({ run: async () => Promise.reject(new Error('boom')) });
    const failed = await failing.service.generate(request);
    expect(!failed.ok && failed.kind === 'error' && failed.message).toBe('boom');
    expect(failing.events.at(-1)).toMatchObject({ status: 'failed', error: 'boom' });
  });

  it('fails a take whose file could not be written', async () => {
    const { service } = setup({ writeBytes: async () => ({ ok: false, kind: 'error', message: 'outside the jail' }) });
    const result = await service.generate(request);
    expect(!result.ok && result.kind === 'error' && result.message).toBe('outside the jail');
  });
});

describe('SFX service — handle', () => {
  it('routes every op and never throws', async () => {
    const { service, deps } = setup();
    expect(await service.handle({ op: 'status' })).toMatchObject({ ok: true, value: { state: 'installed' } });
    await service.handle({ op: 'consent', licenceSha256: SFX_LICENCE_SHA256, revenueAcknowledged: true });
    expect(deps.installer.consent).toHaveBeenCalled();
    await service.handle({ op: 'install' });
    expect(deps.installer.install).toHaveBeenCalled();
    await service.handle({ op: 'uninstall' });
    expect(deps.disposeEngine).toHaveBeenCalled();
    expect(deps.installer.uninstall).toHaveBeenCalled();
    (deps.installer.status as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('disk gone'));
    expect(await service.handle({ op: 'status' })).toMatchObject({ ok: false, message: 'disk gone' });
  });

  it('will not start a download in a build without the runtime', async () => {
    const { service, deps } = setup({ runtimeAvailable: () => false });
    expect(await service.handle({ op: 'status' })).toMatchObject({ ok: true, value: { state: 'unavailable' } });
    expect((await service.handle({ op: 'install' })).ok).toBe(false);
    expect(deps.installer.install).not.toHaveBeenCalled();
  });
});

describe('unavailableSfx', () => {
  it('answers status with the reason and refuses everything else', async () => {
    const handle = unavailableSfx('Midnite Gamer');
    expect(await handle({ op: 'status' })).toMatchObject({ ok: true, value: { state: 'unavailable', reason: expect.stringContaining('Midnite Gamer') } });
    expect((await handle({ op: 'install' })).ok).toBe(false);
  });
});

describe('SFX service — uninstall', () => {
  it('cancels a running generation, ends the engine, and only then deletes the files', async () => {
    const order: string[] = [];
    const { service, deps } = setup({
      run: (_req, opts) =>
        new Promise((_resolve, reject) =>
          opts.signal.addEventListener('abort', () => {
            order.push('abort');
            reject(new Error('cancelled'));
          }),
        ),
      disposeEngine: vi.fn(() => order.push('disposeEngine')),
    });
    vi.mocked(deps.installer.uninstall).mockImplementation(async () => {
      order.push('uninstall');
      return ok({ state: 'not-installed', consent: null, bytesOnDisk: 0, totalBytes: 1 });
    });
    const generating = service.generate(request);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await service.uninstall();
    expect(order).toEqual(['abort', 'disposeEngine', 'uninstall']);
    await expect(generating).resolves.toMatchObject({ ok: false, message: 'cancelled' });
  });
});
