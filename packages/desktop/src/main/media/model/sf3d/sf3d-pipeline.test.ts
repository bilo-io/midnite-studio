import { ModelManifestSchema, SF3D_LICENCE_SHA256, type Sf3dProgressEvent, type Sf3dStatus } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import type { Sf3dInstaller } from './installer';
import { cubeTetGrid } from './marching-tets';
import { createOrtInference, toFloat32, type OrtModule, type OrtSession } from './ort-inference';
import { fitTextureSize, runSf3dPipeline, SF3D_DEFAULTS, sf3dToGltf, type Sf3dInference } from './pipeline';
import { createSf3dBroker, type Sf3dWorkerHandle } from './sf3d-broker';
import { createSf3dService, type Sf3dServiceDeps } from './sf3d-service';
import { parseColorMlp } from './triplane';
import type { Sf3dWorkerIn, Sf3dWorkerOut } from './worker-protocol';

const C = 40;
const R = 4;
/** A colour head that ignores its input and answers mid grey: 120 → 3, zero weights. */
const MLP = parseColorMlp({ w0: Array.from({ length: 3 }, () => new Array(C * 3).fill(0)), b0: [0, 0, 0] });

/** The mocked ONNX graphs: a sphere of radius 0.4 in world space; no weights anywhere. */
function fakeInference(calls: string[] = []): Sf3dInference & { decodedPoints: number } {
  const fake = {
    decodedPoints: 0,
    tokenize: vi.fn(async (input: { rgb: Float32Array; c2w: Float32Array; intrinsicNormed: Float32Array }) => {
      calls.push('tokenize');
      expect(input.rgb.length).toBe(512 * 512 * 3);
      expect(input.c2w.length).toBe(16);
      expect(input.intrinsicNormed.length).toBe(9);
      return new Float32Array(1297 * 1024);
    }),
    backbone: vi.fn(async () => {
      calls.push('backbone');
      return new Float32Array(3 * C * R * R);
    }),
    decode: vi.fn(async (_triplane: Float32Array, positions: Float32Array) => {
      calls.push('decode');
      const n = positions.length / 3;
      fake.decodedPoints += n;
      const density = new Float32Array(n);
      for (let i = 0; i < n; i += 1) {
        const r = Math.hypot(positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!);
        density[i] = SF3D_DEFAULTS.threshold + (0.41 - r) * 100;
      }
      return { density, offset: new Float32Array(n * 3) };
    }),
  };
  return fake;
}

const grid = cubeTetGrid(8);
const rgb = new Float32Array(512 * 512 * 3).fill(0.5);

describe('SF3D pipeline (mocked inference)', () => {
  it('runs tokenizer → backbone → batched decoder → marching tets → atlas bake → glb', async () => {
    const calls: string[] = [];
    const inference = fakeInference(calls);
    const stages: string[] = [];
    const result = await runSf3dPipeline(inference, { grid, mlp: MLP }, rgb, {
      textureSize: 64,
      decodeBatch: 200,
      name: 'ball',
      onStage: (stage) => stages.push(stage),
    });
    expect(calls.slice(0, 2)).toEqual(['tokenize', 'backbone']);
    expect(inference.decodedPoints).toBe(grid.vertices.length / 3);
    expect(inference.decode).toHaveBeenCalledTimes(Math.ceil(grid.vertices.length / 3 / 200));
    expect([...new Set(stages)]).toEqual(['tokenizing', 'backbone', 'decoding', 'meshing', 'texturing']);
    expect(result.triangles).toBeGreaterThan(50);
    expect(result.textureSize).toBeGreaterThanOrEqual(64);
    for (let k = 0; k < 3; k += 1) {
      expect(result.bounds.max[k]).toBeGreaterThan(0.3);
      expect(result.bounds.max[k]).toBeLessThan(0.45);
      expect(result.bounds.min[k]).toBeLessThan(-0.3);
    }
    expect(result.glb.readUInt32LE(0)).toBe(0x46546c67);
    const json = JSON.parse(result.glb.subarray(20, 20 + result.glb.readUInt32LE(12)).toString('utf8'));
    expect(json.accessors[0].count).toBe(result.triangles * 3);
    expect(json.nodes[0].name).toBe('ball');
  });

  it('fails plainly when the picture yields no surface', async () => {
    const inference = fakeInference();
    inference.decode = async (_t, positions) => ({ density: new Float32Array(positions.length / 3), offset: new Float32Array(positions.length) });
    await expect(runSf3dPipeline(inference, { grid, mlp: MLP }, rgb, { textureSize: 64 })).rejects.toThrow(/no surface/);
  });

  it('stops between stages when cancelled', async () => {
    const inference = fakeInference();
    let cancel = false;
    inference.backbone = async () => {
      cancel = true;
      return new Float32Array(3 * C * R * R);
    };
    await expect(runSf3dPipeline(inference, { grid, mlp: MLP }, rgb, { textureSize: 64, isCancelled: () => cancel })).rejects.toThrow('cancelled');
    expect(inference.decode).not.toHaveBeenCalled();
  });

  it('rejects a backbone output that is not a triplane', async () => {
    const inference = fakeInference();
    inference.backbone = async () => new Float32Array(7);
    await expect(runSf3dPipeline(inference, { grid, mlp: MLP }, rgb, { textureSize: 64 })).rejects.toThrow(/triplane/);
  });

  it('grows the texture until the atlas fits, and maps SF3D Z-up to glTF Y-up', () => {
    expect(fitTextureSize(10, 512)).toBe(512);
    expect(fitTextureSize(400_000, 512)).toBe(2048);
    expect(() => fitTextureSize(10_000_000, 512)).toThrow(/too many/);
    expect(sf3dToGltf(1, 2, 3)).toEqual([-2, 3, -1]);
  });
});

describe('onnxruntime-node seam', () => {
  function fakeOrt(inputs: string[]) {
    const feeds: Record<string, unknown>[] = [];
    const ort: OrtModule = {
      Tensor: class {
        constructor(public type: string, public data: Float32Array, public dims: readonly number[]) {}
      } as unknown as OrtModule['Tensor'],
      InferenceSession: {
        create: async (path) => ({
          inputNames: path.includes('tokenizer') ? inputs : path.includes('decoder') ? ['triplane', 'positions'] : ['image_tokens'],
          outputNames: path.includes('decoder') ? ['density', 'vertex_offset'] : ['out'],
          run: async (f: Record<string, unknown>) => {
            feeds.push(f);
            if (path.includes('decoder')) {
              const n = ((f['positions'] as { dims: number[] }).dims[1])!;
              return { density: { type: 'float32', data: new Float32Array(n), dims: [1, n, 1] }, vertex_offset: { type: 'float32', data: new Float32Array(n * 3), dims: [1, n, 3] } };
            }
            // fp16 1.0 = 0x3c00
            return { out: { type: 'float16', data: Uint16Array.from([0x3c00, 0xc000]), dims: [2] } };
          },
        }) as unknown as OrtSession,
      },
    };
    return { ort, feeds };
  }

  it('feeds the tokenizer by input name and converts fp16 outputs', async () => {
    const { ort, feeds } = fakeOrt(['rgb', 'c2w', 'intrinsic_normed']);
    const inference = createOrtInference(ort, (p) => `/x/${p}`);
    const tokens = await inference.tokenize({ rgb, c2w: new Float32Array(16), intrinsicNormed: new Float32Array(9) });
    expect([...tokens]).toEqual([1, -2]);
    expect(Object.keys(feeds[0]!)).toEqual(['rgb', 'c2w', 'intrinsic_normed']);
    expect((feeds[0]!['rgb'] as { dims: number[] }).dims).toEqual([1, 512, 512, 3]);
    const decoded = await inference.decode(new Float32Array(3 * 40 * 2 * 2), new Float32Array(9));
    expect(decoded.density.length).toBe(3);
    expect((feeds[1]!['triplane'] as { dims: number[] }).dims).toEqual([1, 3, 40, 2, 2]);
  });

  it('refuses an input name it does not know, and a non-float tensor', async () => {
    const { ort } = fakeOrt(['rgb', 'mystery']);
    await expect(createOrtInference(ort, (p) => p).tokenize({ rgb, c2w: new Float32Array(16), intrinsicNormed: new Float32Array(9) })).rejects.toThrow(/mystery/);
    expect(() => toFloat32({ type: 'int64', data: [1], dims: [1] })).toThrow(/int64/);
  });
});

describe('SF3D broker', () => {
  function fakeWorker() {
    const sent: Sf3dWorkerIn[] = [];
    let onMessage: (m: unknown) => void = () => undefined;
    let onExit: (code: number) => void = () => undefined;
    const handle: Sf3dWorkerHandle & { killed: boolean } = {
      killed: false,
      postMessage: (m) => sent.push(m as Sf3dWorkerIn),
      on: ((event: string, listener: (x: never) => void) => {
        if (event === 'message') onMessage = listener as (m: unknown) => void;
        else onExit = listener as (code: number) => void;
      }) as Sf3dWorkerHandle['on'],
      kill: () => {
        handle.killed = true;
        onExit(1);
      },
    };
    return { handle, sent, reply: (m: Sf3dWorkerOut) => onMessage(m), exit: () => onExit(1) };
  }
  const req = { assetsDir: '/a', rgb: new Float32Array(3), textureSize: 512, name: 'x' };

  it('forwards stages and resolves the reply', async () => {
    const w = fakeWorker();
    const broker = createSf3dBroker({ spawn: () => w.handle });
    const stages: string[] = [];
    const run = broker.run(req, { signal: new AbortController().signal, onStage: (s) => stages.push(s) });
    await vi.waitFor(() => expect(w.sent).toHaveLength(1));
    const id = w.sent[0]!.id;
    w.reply({ type: 'stage', id, stage: 'backbone' });
    w.reply({ type: 'reply', id, ok: true, glb: new Uint8Array([1]), vertices: 3, triangles: 1, bounds: { min: [0, 0, 0], max: [1, 1, 1] }, textureSize: 512 });
    await expect(run).resolves.toMatchObject({ ok: true, triangles: 1 });
    expect(stages).toEqual(['backbone']);
  });

  it('cancels by killing the worker, and reports a crash when it dies on its own', async () => {
    const w = fakeWorker();
    const broker = createSf3dBroker({ spawn: () => w.handle });
    const controller = new AbortController();
    const run = broker.run(req, { signal: controller.signal, onStage: () => undefined });
    await vi.waitFor(() => expect(w.sent).toHaveLength(1));
    controller.abort();
    await expect(run).rejects.toThrow('cancelled');
    expect(w.handle.killed).toBe(true);

    const w2 = fakeWorker();
    const broker2 = createSf3dBroker({ spawn: () => w2.handle });
    const run2 = broker2.run(req, { signal: new AbortController().signal, onStage: () => undefined });
    await vi.waitFor(() => expect(w2.sent).toHaveLength(1));
    w2.exit();
    await expect(run2).rejects.toThrow(/stopped unexpectedly/);
  });
});

describe('SF3D service', () => {
  const installed: Sf3dStatus = {
    state: 'installed',
    consent: { licenceSha256: SF3D_LICENCE_SHA256, acceptedAt: '2026-10-04T00:00:00.000Z', revenueAcknowledged: true },
    bytesOnDisk: 10,
    totalBytes: 10,
  };
  function setup(status: Sf3dStatus = installed, overrides: Partial<Sf3dServiceDeps> = {}) {
    const writes: { path: string; data: Buffer }[] = [];
    const events: Sf3dProgressEvent[] = [];
    const installer = {
      status: vi.fn(async () => status),
      assetPath: (p: string) => `/ud/sf3d/assets${p ? `/${p}` : ''}`,
      consent: vi.fn(async () => ({ ok: true, value: status })),
      revokeConsent: vi.fn(),
      install: vi.fn(async () => ({ ok: true, value: status })),
      cancel: vi.fn(() => ({ ok: true, value: undefined })),
      uninstall: vi.fn(async () => ({ ok: true, value: { ...status, state: 'not-installed', consent: null } })),
    } as unknown as Sf3dInstaller;
    const run = vi.fn(async (_req: unknown, opts: { onStage: (s: 'backbone') => void }) => {
      opts.onStage('backbone');
      return { type: 'reply' as const, id: '1', ok: true as const, glb: new Uint8Array([7, 7]), vertices: 30, triangles: 10, bounds: { min: [-0.4, -0.2, -0.3] as [number, number, number], max: [0.4, 0.2, 0.3] as [number, number, number] }, textureSize: 1024 };
    });
    const disposeEngine = vi.fn();
    const service = createSf3dService({
      installer,
      run,
      decodeImage: () => ({ data: new Uint8Array(4).fill(255), width: 1, height: 1 }),
      writeBytes: async (r) => {
        writes.push({ path: r.path, data: r.data });
        return { ok: true, value: undefined };
      },
      emit: (e) => events.push(e),
      disposeEngine,
      author: async () => ({ name: 'Bilo' }),
      now: () => new Date(2026, 9, 4, 12, 0, 0),
      ...overrides,
    });
    return { service, writes, events, run, installer, disposeEngine };
  }
  const image = { name: 'mug.png', mime: 'image/png' as const, data: Buffer.from('png').toString('base64') };
  const generate = { op: 'generate' as const, generationId: 'g1', repoId: 'r', project: 'props', image };

  it('writes the glb, the reference picture and a model.json naming sf3d into the library layout', async () => {
    const { service, writes, events } = setup();
    const result = await service.handle(generate);
    expect(result).toEqual({ ok: true, value: { files: ['mug-20261004-120000/mug-20261004-120000.glb', 'mug-20261004-120000/mug-20261004-120000.ref.png', 'mug-20261004-120000/model.json'], primary: 'mug-20261004-120000/mug-20261004-120000.glb', vertices: 30, triangles: 10 } });
    const manifest = ModelManifestSchema.parse(JSON.parse(writes[2]!.data.toString('utf8')));
    expect(manifest).toMatchObject({
      name: 'mug',
      agent: { provider: 'sf3d', model: 'stabilityai/stable-fast-3d' },
      author: { name: 'Bilo' },
      attachment: { file: 'mug-20261004-120000.ref.png' },
      files: { glb: 'mug-20261004-120000.glb' },
      details: { vertices: 30, polygons: 10, parts: 1, bounds: { size: [0.8, 0.4, 0.6] } },
    });
    expect((manifest as Record<string, unknown>)['sf3d']).toMatchObject({ revision: expect.any(String), textureSize: 1024 });
    expect(writes[1]!.data.toString()).toBe('png');
    expect(events.map((e) => (e.kind === 'generate' ? `${e.status}:${e.stage ?? ''}` : 'install'))).toEqual([
      'running:preparing',
      'running:backbone',
      'running:writing',
      'succeeded:',
    ]);
  });

  it('refuses to generate without consent or an install, without starting the worker', async () => {
    const noConsent = setup({ ...installed, consent: null });
    expect(await noConsent.service.handle(generate)).toMatchObject({ ok: false, message: expect.stringMatching(/Accept the Stability/) });
    const notInstalled = setup({ ...installed, state: 'not-installed' });
    expect(await notInstalled.service.handle(generate)).toMatchObject({ ok: false, message: expect.stringMatching(/not installed/) });
    expect(noConsent.run).not.toHaveBeenCalled();
    expect(notInstalled.run).not.toHaveBeenCalled();
  });

  it('reports unavailable when the runtime is missing, and refuses to install', async () => {
    const { service, installer } = setup(installed, { runtimeAvailable: () => false });
    expect(await service.handle({ op: 'status' })).toMatchObject({ ok: true, value: { state: 'unavailable' } });
    expect(await service.handle({ op: 'install' })).toMatchObject({ ok: false });
    expect(installer.install).not.toHaveBeenCalled();
  });

  it('cancels a running generation into a cancelled event, with nothing written', async () => {
    let release!: () => void;
    const { service, writes, events } = setup(installed, {
      run: (_req, opts) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => reject(new Error('cancelled')));
          release = () => undefined;
        }),
    });
    const running = service.handle(generate);
    await vi.waitFor(() => expect(release).toBeDefined());
    expect(await service.handle({ op: 'cancelGenerate', generationId: 'g1' })).toEqual({ ok: true, value: undefined });
    expect(await running).toEqual({ ok: false, kind: 'error', message: 'cancelled' });
    expect(writes).toEqual([]);
    expect(events.at(-1)).toMatchObject({ kind: 'generate', status: 'cancelled' });
    expect(await service.handle({ op: 'cancelGenerate', generationId: 'nope' })).toMatchObject({ ok: false });
  });

  it('answers every op with the envelope, even when the installer throws', async () => {
    const { service, installer, disposeEngine } = setup();
    (installer.consent as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('disk full'));
    expect(await service.handle({ op: 'consent', licenceSha256: SF3D_LICENCE_SHA256, revenueAcknowledged: true })).toEqual({ ok: false, kind: 'error', message: 'disk full' });
    expect(await service.handle({ op: 'cancelInstall' })).toMatchObject({ ok: true });
    expect(await service.handle({ op: 'uninstall' })).toMatchObject({ ok: true, value: { state: 'not-installed' } });
    expect(disposeEngine).toHaveBeenCalledOnce();
  });

  it('fails with a message when the picture cannot be decoded', async () => {
    const { service, events } = setup(installed, { decodeImage: () => null });
    expect(await service.handle(generate)).toMatchObject({ ok: false, message: 'The picture could not be read.' });
    expect(events.at(-1)).toMatchObject({ status: 'failed' });
  });
});
