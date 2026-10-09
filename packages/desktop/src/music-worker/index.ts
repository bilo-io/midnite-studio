import { createMusicRuntime } from '../main/media/audio/musicgen/runtime';
import type { MusicWorkerIn, MusicWorkerOut } from '../main/media/audio/musicgen/worker-protocol';

/**
 * `utilityProcess` entry point `music-broker.ts` forks — the same shape as
 * `companion-tts-worker/index.ts`: its own OS process so a multi-second ONNX
 * render never blocks main's event loop (and with it every window's input).
 * Deliberately thin: the model lifecycle lives in `musicgen/runtime.ts`; this
 * file is only the message plumbing. `@huggingface/transformers` is required
 * lazily so a missing native module reports "unavailable" instead of
 * crashing the worker at load.
 */
let directory = '';
const cancelled = new Set<string>();

const runtime = createMusicRuntime({
  // A lazy `require`, not an import: a missing native `onnxruntime-node` must fail soft (see `companion/tts.ts`).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  loadModule: async () => require('@huggingface/transformers') as typeof import('@huggingface/transformers'),
  get directory() {
    return directory;
  },
});

const post = (message: MusicWorkerOut) => process.parentPort.postMessage(message);

process.parentPort.on('message', (event) => {
  const data = event.data as MusicWorkerIn;
  switch (data.type) {
    case 'configure':
      directory = data.directory;
      return;
    case 'status':
      post({ type: 'status-reply', id: data.id, value: runtime.status() });
      return;
    case 'install':
      runtime
        .install((progress) => post({ type: 'install-progress', progress }))
        .then(
          () => post({ type: 'install-reply', id: data.id, ok: true }),
          (error: unknown) =>
            post({ type: 'install-reply', id: data.id, ok: false, message: error instanceof Error ? error.message : String(error) }),
        );
      return;
    case 'cancel':
      cancelled.add(data.id);
      return;
    case 'render':
      runtime
        .render(
          { prompt: data.prompt, seconds: data.seconds },
          {
            isCancelled: () => cancelled.has(data.id),
            onProgress: (fraction) => post({ type: 'render-progress', id: data.id, fraction }),
            onInstall: (progress) => post({ type: 'install-progress', progress }),
          },
        )
        .then(
          ({ samples, sampleRate }) => post({ type: 'render-reply', id: data.id, ok: true, samples, sampleRate }),
          (error: unknown) =>
            post({ type: 'render-reply', id: data.id, ok: false, message: error instanceof Error ? error.message : String(error) }),
        )
        .finally(() => cancelled.delete(data.id));
      return;
  }
});
