import { createRequire } from 'node:module';
import { join } from 'node:path';

import { createOrtInference, loadSf3dAssets, type OrtModule } from '../main/media/model/sf3d/ort-inference';
import { runSf3dPipeline, type Sf3dAssets, type Sf3dInference } from '../main/media/model/sf3d/pipeline';
import type { Sf3dWorkerIn, Sf3dWorkerOut } from '../main/media/model/sf3d/worker-protocol';

/**
 * `utilityProcess` entry point `sf3d-broker.ts` forks (Phase 103 Theme J): SF3D's three ONNX graphs
 * and the TypeScript meshing/baking run here, in their own OS process, so tens of seconds of
 * inference never block main's event loop. A cancel kills this process — an ORT `run` cannot be
 * interrupted from inside — and the next generation forks a fresh one.
 *
 * `onnxruntime-node` is not a direct dependency of the app: it is `@huggingface/transformers`' own
 * (the voice and music engines' runtime), so it is resolved *from there*, lazily, and a build
 * without it answers with a plain error instead of crashing at load.
 */
const post = (message: Sf3dWorkerOut) => process.parentPort.postMessage(message);

let loaded: { dir: string; inference: Sf3dInference; assets: Promise<Sf3dAssets> } | null = null;

function loadOrt(): OrtModule {
  const transformers = require.resolve('@huggingface/transformers');
  return createRequire(transformers)('onnxruntime-node') as OrtModule;
}

function runtimeFor(dir: string) {
  if (loaded?.dir === dir) return loaded;
  const path = (asset: string) => join(dir, ...asset.split('/'));
  loaded = { dir, inference: createOrtInference(loadOrt(), path), assets: loadSf3dAssets(path) };
  return loaded;
}

process.parentPort.on('message', (event) => {
  const data = event.data as Sf3dWorkerIn;
  if (data.type !== 'generate') return;
  void (async () => {
    try {
      post({ type: 'stage', id: data.id, stage: 'loading' });
      const runtime = runtimeFor(data.assetsDir);
      const assets = await runtime.assets;
      const result = await runSf3dPipeline(runtime.inference, assets, data.rgb, {
        textureSize: data.textureSize,
        name: data.name,
        onStage: (stage, fraction) => post({ type: 'stage', id: data.id, stage, ...(fraction !== undefined ? { fraction } : {}) }),
      });
      post({ type: 'reply', id: data.id, ok: true, glb: new Uint8Array(result.glb), vertices: result.vertices, triangles: result.triangles, bounds: result.bounds, textureSize: result.textureSize });
    } catch (error) {
      post({ type: 'reply', id: data.id, ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  })();
});
