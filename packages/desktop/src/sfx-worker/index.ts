import { createRequire } from 'node:module';
import { join } from 'node:path';

import {
  createSfxOrtInference,
  loadSfxTokenizer,
  runSfxPipeline,
  type SfxInference,
  type SfxOrtModule,
  type SfxTokenizerModule,
  type SfxTokens,
  type SfxWorkerIn,
  type SfxWorkerOut,
} from '@midnite/studio-feature-media-audio/sfx-worker';

/**
 * `utilityProcess` entry point `sfx-broker.ts` forks: Stable Audio Open Small's three ONNX graphs and the
 * TypeScript ping-pong sampler run here, in their own OS process, so ~10 s of inference never blocks main's
 * event loop. A cancel (or the broker's idle timer) kills this process; the next take forks a fresh one.
 *
 * `onnxruntime-node` and the T5 tokenizer both come from `@huggingface/transformers` (the voice and music
 * engines' runtime), resolved lazily and with `require` — its ESM build does not expose `T5Tokenizer` as a
 * constructor when dynamically imported — so a build without them answers with a plain error.
 */
const post = (message: SfxWorkerOut) => process.parentPort.postMessage(message);

let loaded: { dir: string; inference: SfxInference; tokenize: Promise<(text: string) => SfxTokens> } | null = null;

function runtimeFor(dir: string) {
  if (loaded?.dir === dir) return loaded;
  const transformersPath = require.resolve('@huggingface/transformers');
  const fromTransformers = createRequire(transformersPath);
  const ort = fromTransformers('onnxruntime-node') as SfxOrtModule;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const transformers = require('@huggingface/transformers') as SfxTokenizerModule;
  const path = (asset: string) => join(dir, ...asset.split('/'));
  loaded = { dir, inference: createSfxOrtInference(ort, path), tokenize: loadSfxTokenizer(transformers, path('tokenizer.json')) };
  return loaded;
}

process.parentPort.on('message', (event) => {
  const data = event.data as SfxWorkerIn;
  if (data.type !== 'generate') return;
  void (async () => {
    try {
      post({ type: 'stage', id: data.id, stage: 'loading' });
      const runtime = runtimeFor(data.assetsDir);
      const tokenize = await runtime.tokenize;
      const result = await runSfxPipeline(runtime.inference, tokenize, data.take, {
        onStage: (stage, fraction) => post({ type: 'stage', id: data.id, stage, ...(fraction !== undefined ? { fraction } : {}) }),
      });
      post({ type: 'reply', id: data.id, ok: true, channels: result.channels, sampleRate: result.sampleRate });
    } catch (error) {
      loaded = null;
      post({ type: 'reply', id: data.id, ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  })();
});
