import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { failure, ok, type GitOpResult } from '@midnite/studio-shared';

// `kokoro-js` (and the `@huggingface/transformers` it re-exports through
// `loadModule` below) is loaded lazily, not imported here — see
// `loadKokoro()` and `inproc-pty.ts`'s identical `loadNodePty()`, the
// precedent this mirrors line for line. `@huggingface/transformers` ships
// resolvable top-level types; `kokoro-js` ships types too, but only behind a
// `package.json` `exports` map this repo's classic `moduleResolution: "node"`
// can't see — see `kokoro-js.d.ts`, this module's narrow, hand-rolled
// declaration for the surface actually called (the same call
// `sherpa-onnx-node.d.ts` made, for the opposite reason: that package shipped
// no types at all).
type KokoroModule = typeof import('kokoro-js');
type TransformersModule = typeof import('@huggingface/transformers');
type KokoroTtsInstance = InstanceType<KokoroModule['KokoroTTS']>;

/**
 * The local voice engine (originally Phase 80 Theme C on `sherpa-onnx-node`;
 * this module is its Kokoro-82M replacement — an explicit engine swap, not a
 * re-architecture, ordered because sherpa's own phonemizer turned out to embed
 * a GPL-3.0 component, see the licensing note at the bottom of this doc).
 *
 * **Follows the `node-pty` precedent exactly** (`docs/INITIAL_PLAN.md:27,147`):
 * a native module (`onnxruntime-node`, reached through `kokoro-js` and
 * `@huggingface/transformers`), main-process-only, one Electron ABI, and "a
 * lazy fail-soft require degrades to unavailable, not a crash." Three ways
 * this can fail, and all three answer `{ok:false}` rather than throw across
 * the IPC boundary:
 *
 * 1. **The native module itself won't load** — an unsupported platform, or a
 *    missing prebuilt `onnxruntime-node` binary. `@huggingface/transformers`'s
 *    `backends/onnx.js` does a **static top-level** `import * as ONNX_NODE
 *    from 'onnxruntime-node'`, so `require('kokoro-js')` throws synchronously
 *    the instant that native addon is missing — a *static* top-level import of
 *    `kokoro-js` here would crash main at boot on such a platform, exactly the
 *    hazard `loadKokoro()` below exists to avoid, inside a `try`/`catch`,
 *    exactly as `inproc-pty.ts`'s `loadNodePty()` already does for `node-pty`
 *    (generalised here to take the loader as a dependency, since a native
 *    module's `require()` is one of the few things in this codebase a test
 *    genuinely cannot swap by mocking the import — it reaches past the test
 *    runner's module graph to Node's real loader). A failure here is
 *    **sticky** for the process's lifetime — retrying a missing binary on
 *    every utterance is pointless work.
 * 2. **The model hasn't been provisioned yet.** `KokoroTTS.from_pretrained()`
 *    downloads the ONNX weights from the Hugging Face Hub once, lazily, on
 *    first use, into `app.getPath('userData')/companion-voice/kokoro/` — never
 *    into the app bundle, `transformers.js`'s own default `<package>/.cache/`
 *    (unwritable once packaged into an asar, and the exact failure mode that
 *    already burned this feature once — see point 2's `sherpa-onnx-node`
 *    precedent), or the user's home dotfiles. `configureCompanionTts` points
 *    `@huggingface/transformers`'s `env.cacheDir` there before any load is
 *    attempted. Unlike a missing native module, a provisioning failure
 *    (offline, a flaky mirror, a stalled connection) is treated as
 *    **transient**: the next utterance tries again rather than being
 *    permanently silenced by one bad network blip. `kokoro-js` does its own
 *    file-level HTTP fetch and on-disk caching (`FileCache` in
 *    `@huggingface/transformers`) — the tarball/bz2/hand-rolled-tar-reader
 *    machinery the sherpa build needed is gone; only a timeout guard remains,
 *    since `transformers.js` has no built-in one and a stalled first "Say
 *    hello" should give up rather than hang forever.
 * 3. **Synthesis itself throws** for a given piece of text — reported as a
 *    per-call failure. Sticky, exactly as a load failure is (module doc's
 *    precedent, kept identical here): a `.generate()` throw on this model
 *    tends to mean a corrupt cache or an incompatible ONNX Runtime build,
 *    neither of which a fresh attempt on the very next utterance fixes.
 *
 * `speaker.ts` on the renderer side treats every `{ok:false}` here identically:
 * fall back to `speechSynthesis` for that utterance. The companion is never
 * left mute because a native module didn't load.
 *
 * **The voice: `af_heart`.** Kokoro-82M ships dozens (`af_*`, `am_*`, `bf_*`,
 * `bm_*`, …); `af_heart` is the one the model card and `kokoro-js`'s own
 * README example both single out as its top overall grade (`A`) — the most
 * broadly well-trained American English voice in the set, and the least
 * surprising default for a companion most users will hear in en-US. No voice
 * picker in this PR: `companionVoice`, the *existing* Settings dropdown, still
 * governs the `speechSynthesis` fallback exactly as it always did (Kokoro
 * speaks first and does not read that value) — a Kokoro voice picker is a
 * clean, separable follow-up, not a requirement of this swap.
 *
 * **Quantisation: `q8`.** `kokoro-js` offers `fp32`/`fp16`/`q8`/`q4`/`q4f16`.
 * `fp32` is 326 MB on disk for a barely-perceptible quality gain on an 82M
 * parameter model; `q4` trades noticeably more quality for not much less size
 * (305 MB — the *weights* barely shrink at 4-bit for a model this small,
 * because Kokoro's biggest tensors are already narrow). `q8` is the
 * deliberate middle: ~88 MB on disk (`model_quantized.onnx`, measured off this
 * build's own download) for quality indistinguishable from `fp32` in casual
 * listening, and it's what `kokoro-js`'s own README leads with for a
 * non-browser target. Measured on this machine (Apple Silicon, CPU
 * inference): ~505 MB resident once the model is loaded and warm (the
 * `onnxruntime-node` session plus the decompressed q8 weights and its working
 * buffers) — a real increase over Piper's tens of MB, and the trade the repo
 * owner explicitly accepted overruling Phase 80 Theme C's original choice.
 * Warm model load off an already-cached disk: ~0.4 s; a cold model load
 * (first run, downloading ~88 MB) took ~15 s on this connection; first
 * utterance after that: ~3 s for a ~5 s clip (a sub-1x realtime factor on
 * CPU); a second, warm utterance: ~1.2 s. All measured by this PR's own
 * throwaway script against the real package — see the PR body for the run.
 *
 * **A licensing question this swap was partly ordered to resolve — and it
 * does not resolve it.** `sherpa-onnx-node`'s compiled binary statically links
 * a GPL-3.0 `espeak-ng` fork for phonemization (this module's own prior
 * doc, and `.midnite/tasks/done.md`). `kokoro-js` phonemizes English through
 * its `phonemizer` dependency, whose own package description is "Simple text
 * to phones converter using eSpeak NG" — and inspecting its bundled
 * `dist/phonemizer.cjs` confirms it literally *is* espeak-ng, Emscripten-
 * compiled to WebAssembly (its own internal strings still read
 * `espeak-ng-data`, `espeak-ng-ipa-tmp-`, and it carries the same Emscripten
 * module-loader boilerplate `sherpa-onnx-node`'s C++ build does). `kokoro-js`
 * calls `phonemizer.phonemize()` unconditionally with no alternative backend
 * (`dist/kokoro.cjs`: `require("phonemizer")`, called from every `generate()`
 * and `stream()` path) — there is no way to use Kokoro's English voices
 * without it. `phonemizer`'s own `LICENSE` file is Apache-2.0, but that covers
 * the JS wrapper its author wrote, not the GPL-3.0 espeak-ng engine compiled
 * into the WASM blob it ships and requires at runtime — the same shape of
 * problem as a statically-linked `.dylib`, over a different embedding
 * mechanism (an npm dependency carrying a compiled WASM binary rather than a
 * binary linked into our own native addon). **The GPL-3.0 espeak-ng
 * dependency is not gone; it moved.** This still needs the same human legal
 * read before public distribution that Phase 80 Theme C flagged — see the PR
 * body's Decisions section, and `.midnite/tasks/done.md`'s updated note.
 */

/** Exported for the test's own assertions, and for `getCompanionTtsStatus` — not part of the public contract. */
export const VOICE_ID = 'af_heart';

/** `kokoro-js`'s own default ONNX export of Kokoro-82M v1.0 on the Hugging Face Hub. */
const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

/** See the module doc's quantisation note. */
const DTYPE = 'q8';

/** The on-disk file `dtype: 'q8'` resolves to — used only by `modelReady()`'s cheap existence check. */
const QUANTIZED_MODEL_FILE = 'model_quantized.onnx';

/** Give up on a stalled download rather than hanging the first "Say hello" forever. `transformers.js` has no built-in fetch timeout of its own. */
const MODEL_LOAD_TIMEOUT_MS = 120_000;

export type CompanionTtsDeps = {
  /** `app.getPath('userData')`, injected so this module carries no `electron` import. */
  directory: string;
  /**
   * `require('kokoro-js')` plus the `@huggingface/transformers` `env` it
   * shares an installed copy with — injected, not called inline, for the same
   * reason everything else here is: a native module's `require()` reaches
   * straight past a test runner's module graph to Node's real loader, so
   * `tts.test.ts` swaps this for a fake rather than trying to mock the
   * package itself. Bundled into one loader (rather than two separate
   * `loadModule`s) because both requires must fail together: an unsupported
   * platform breaks `onnxruntime-node`, which `kokoro-js` pulls in via a
   * static top-level import of `@huggingface/transformers` — see the module
   * doc's point 1.
   */
  loadModule: () => { KokoroTTS: KokoroModule['KokoroTTS']; env: TransformersModule['env'] };
};

function requireKokoro(): { KokoroTTS: KokoroModule['KokoroTTS']; env: TransformersModule['env'] } {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { KokoroTTS } = require('kokoro-js') as KokoroModule;
  const { env } = require('@huggingface/transformers') as TransformersModule;
  /* eslint-enable @typescript-eslint/no-require-imports */
  return { KokoroTTS, env };
}

function defaultDeps(directory: string): CompanionTtsDeps {
  return { directory, loadModule: requireKokoro };
}

let configured: CompanionTtsDeps | null = null;
let kokoro: { KokoroTTS: KokoroModule['KokoroTTS']; env: TransformersModule['env'] } | null = null;
let ttsInstance: KokoroTtsInstance | null = null;
/** Sticky once set: a missing native module does not become available mid-run. */
let loadFailure: string | null = null;
/**
 * Which of the two sticky-failure call sites set `loadFailure` — `require()`
 * itself throwing (`loadKokoro`) versus `.generate()` throwing later
 * (`synthesizeSpeech`'s own catch). Both are sticky for the same reason (the
 * module doc above), but `getCompanionTtsStatus` reports them as the distinct
 * reasons `tts-status`'s schema promises rather than collapsing both into
 * "native module missing".
 */
let loadFailureKind: 'native-module-missing' | 'synthesis-error' | null = null;
/** Dedupes a provisioning load racing two utterances that both start cold. */
let modelLoading: Promise<GitOpResult<KokoroTtsInstance>> | null = null;
/**
 * The last provisioning failure, cleared the moment a fresh attempt starts —
 * unlike `loadFailure` this is NOT sticky: a network blip is retried on the
 * next call automatically (the module doc's point 2), and `getCompanionTtsStatus`
 * uses this to explain a `'failed'` `voice` state without re-triggering a
 * download on every poll.
 */
let provisioningError: string | null = null;

/**
 * `deps.loadModule()`, lazily and fail-soft — called on first synthesis
 * request, never at import time, so an unsupported platform or a missing
 * prebuilt `onnxruntime-node` binary degrades this feature to "use
 * `speechSynthesis`" instead of crashing main at boot. The same shape as
 * `inproc-pty.ts`'s `loadNodePty()`, generalised to take its loader as a
 * parameter instead of hard-coding `require()` inline.
 */
function loadKokoro(
  deps: CompanionTtsDeps,
): { KokoroTTS: KokoroModule['KokoroTTS']; env: TransformersModule['env'] } | null {
  // Checked first, ahead of the cached module: a `.generate()` throw in
  // `synthesizeSpeech` sets `loadFailure` without clearing `kokoro` (the load
  // itself did succeed), and that failure must still short-circuit every
  // later call rather than retrying a bad model each time.
  if (loadFailure !== null) return null;
  if (kokoro) return kokoro;
  try {
    kokoro = deps.loadModule();
    // Point `transformers.js` at userData before anything can trigger a
    // download — see the module doc's point 2. Idempotent and cheap enough
    // to set on every successful (cached) load rather than only once.
    kokoro.env.cacheDir = modelCacheDir(deps.directory);
    return kokoro;
  } catch (error) {
    loadFailure = error instanceof Error ? error.message : 'kokoro-js failed to load';
    loadFailureKind = 'native-module-missing';
    return null;
  }
}

/**
 * The old Piper voice's own subdirectory under `companion-voice/` (Phase 80
 * Theme C's `sherpa-onnx-node` build, before this engine swap) — up to ~77 MB,
 * orphaned the moment `sherpa-onnx-node` stopped being required at all. Swept
 * up rather than left to rot forever: a user who already downloaded it should
 * not silently keep 77 MB of dead bytes on every future boot. Best-effort and
 * silent — this is disk hygiene, not a user-facing operation, so a permission
 * error or an already-absent directory is not worth a log line, still less a
 * failure surfaced anywhere.
 */
const STALE_PIPER_VOICE_DIR = 'en_US-joe-medium';

function cleanUpStalePiperVoice(directory: string): void {
  void rm(join(directory, 'companion-voice', STALE_PIPER_VOICE_DIR), {
    recursive: true,
    force: true,
  }).catch(() => {});
}

/** Injected at boot with `app.getPath('userData')`, beside every other store's wiring. */
export function configureCompanionTts(directory: string): void {
  configured = defaultDeps(directory);
  cleanUpStalePiperVoice(directory);
}

export function companionTtsDeps(): CompanionTtsDeps | null {
  return configured;
}

/** Reset module state. Tests only. */
export function resetCompanionTtsForTest(overrides: Partial<CompanionTtsDeps> = {}): void {
  kokoro = null;
  ttsInstance = null;
  loadFailure = null;
  loadFailureKind = null;
  modelLoading = null;
  provisioningError = null;
  configured = overrides.directory !== undefined ? defaultDeps(overrides.directory) : null;
  if (configured && overrides.loadModule !== undefined) {
    configured.loadModule = overrides.loadModule;
  }
}

/**
 * Under `app.getPath('userData')`, never `transformers.js`'s own default
 * `<package>/.cache/` (unwritable once packaged into an asar) nor the user's
 * home dotfiles — the module doc's point 2, and the exact failure mode that
 * already burned this feature once.
 */
function modelCacheDir(directory: string): string {
  return join(directory, 'companion-voice', 'kokoro');
}

/**
 * A cheap on-disk existence check, mirroring the old `voiceReady()` — cheap
 * enough for `getCompanionTtsStatus` to poll without spinning up a full ONNX
 * session just to answer a Settings page. `transformers.js`'s `FileCache`
 * joins `env.cacheDir` with `${model_id}/${filename}` verbatim (no revision
 * segment) — empirically confirmed against this build's own cache directory
 * — so the path below is deterministic for the fixed `MODEL_ID`/`DTYPE` this
 * module always requests.
 */
function modelReady(directory: string): boolean {
  const dir = modelCacheDir(directory);
  return (
    existsSync(join(dir, MODEL_ID, 'onnx', QUANTIZED_MODEL_FILE)) &&
    existsSync(join(dir, MODEL_ID, 'tokenizer.json')) &&
    existsSync(join(dir, MODEL_ID, 'config.json'))
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Load (downloading on first use) and cache the Kokoro model in memory.
 * Deduped through the module-level `modelLoading` promise: two utterances
 * arriving before the first finishes share one load. Unlike the old
 * hand-rolled tarball extraction, `kokoro-js`/`transformers.js` own the whole
 * download-and-cache pipeline; this only adds the give-up timeout they lack.
 */
async function ensureModel(
  deps: CompanionTtsDeps,
  module: { KokoroTTS: KokoroModule['KokoroTTS']; env: TransformersModule['env'] },
): Promise<GitOpResult<KokoroTtsInstance>> {
  if (ttsInstance !== null) {
    provisioningError = null;
    return ok(ttsInstance);
  }

  if (modelLoading === null) {
    // Cleared at the start of every fresh attempt, not just on success — a
    // `getCompanionTtsStatus` poll mid-download must not still be reporting
    // the *previous* attempt's failure message.
    provisioningError = null;
    modelLoading = (async (): Promise<GitOpResult<KokoroTtsInstance>> => {
      try {
        const instance = await withTimeout(
          module.KokoroTTS.from_pretrained(MODEL_ID, { dtype: DTYPE, device: 'cpu' }),
          MODEL_LOAD_TIMEOUT_MS,
          'Timed out downloading the local voice.',
        );
        ttsInstance = instance;
        provisioningError = null;
        return ok(instance);
      } catch (error) {
        provisioningError = `Could not download the local voice (${error instanceof Error ? error.message : String(error)}). The companion will keep using the system voice.`;
        return failure(provisioningError);
      } finally {
        // Each attempt gets a fresh try — a network blip is not sticky like a
        // missing native module is.
        modelLoading = null;
      }
    })();
  }
  return modelLoading;
}

/**
 * 16-bit PCM mono WAV, matching `stt/index.ts`'s `silentWavClip` — the same
 * "no audio assets, no encoder dependency" shape, over generated rather than
 * silent samples. `decodeAudioData` on the renderer side reads a WAV
 * natively. Kokoro's own `RawAudio.toWav()` (in `@huggingface/transformers`)
 * writes 32-bit float PCM instead — this hand-rolled encoder is kept, not
 * swapped for that one, because it halves the bytes crossing the IPC boundary
 * on every utterance for output `decodeAudioData` reads identically either
 * way.
 */
function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }

  return new Uint8Array(buffer);
}

/**
 * Text in, one WAV clip out. Never throws — every failure mode in the module
 * doc above answers `{ok:false}` with a sentence `speaker.ts` never has to
 * show (it falls back silently to `speechSynthesis`), because a native-module
 * or a network failure is not something a user typing to the companion caused.
 */
export async function synthesizeSpeech(
  text: string,
  deps: CompanionTtsDeps | null = configured,
): Promise<GitOpResult<{ audio: Uint8Array; mime: string }>> {
  if (deps === null) {
    return failure('The local voice is not set up yet.');
  }
  const module = loadKokoro(deps);
  if (module === null) {
    return failure('The local voice engine is unavailable on this machine.');
  }

  const provisioned = await ensureModel(deps, module);
  if (!provisioned.ok) return provisioned;

  try {
    const audio = await provisioned.value.generate(text, { voice: VOICE_ID });
    return ok({ audio: encodeWav(audio.audio, audio.sampling_rate), mime: 'audio/wav' });
  } catch (error) {
    // A throw from `.generate()` (a corrupt cache, an incompatible ONNX
    // Runtime build) is the "missing binary" case in spirit even when it
    // surfaces later than `require()` — sticky for the same reason.
    loadFailure = error instanceof Error ? error.message : 'kokoro-js failed to generate speech';
    loadFailureKind = 'synthesis-error';
    ttsInstance = null;
    return failure(
      `The local voice failed to start (${error instanceof Error ? error.message : String(error)}). The companion will keep using the system voice.`,
    );
  }
}

export type CompanionTtsStatusValue = {
  /** This process's own view of which tier it can currently offer. */
  engine: 'local' | 'system';
  voice: 'idle' | 'downloading' | 'ready' | 'failed';
  reason: 'native-module-missing' | 'download-failed' | 'synthesis-error' | null;
  message: string | null;
};

/**
 * A snapshot of the local engine's health for Settings ▸ Companion ▸ Voice —
 * never throws, never synthesizes anything, and by default never re-attempts
 * a provisioning download that already failed (`retry` forces one).
 *
 * The first call made with the model not yet on disk — or any call with
 * `retry: true` — kicks off `ensureModel()` and reports `'downloading'`
 * immediately rather than awaiting the up-to-`MODEL_LOAD_TIMEOUT_MS` round
 * trip inline; the caller polls again for `'ready'`/`'failed'`. This is what
 * makes opening the Voice section the moment the one-time download starts,
 * instead of the first "Say hello".
 */
export async function getCompanionTtsStatus(
  retry: boolean,
  deps: CompanionTtsDeps | null = configured,
): Promise<CompanionTtsStatusValue> {
  if (deps === null) {
    return { engine: 'system', voice: 'idle', reason: null, message: null };
  }

  const module = loadKokoro(deps);
  if (module === null) {
    return {
      engine: 'system',
      voice: 'failed',
      reason: loadFailureKind ?? 'native-module-missing',
      message: loadFailure,
    };
  }

  if (ttsInstance !== null || modelReady(deps.directory)) {
    return { engine: 'local', voice: 'ready', reason: null, message: null };
  }

  if (modelLoading !== null) {
    return { engine: 'system', voice: 'downloading', reason: null, message: null };
  }

  if (provisioningError !== null && !retry) {
    return { engine: 'system', voice: 'failed', reason: 'download-failed', message: provisioningError };
  }

  // No attempt yet, or an explicit retry after a prior (transient) failure.
  // Fire-and-forget: `ensureModel` dedupes concurrent callers on its own via
  // `modelLoading`, exactly as two overlapping `synthesizeSpeech` calls do.
  void ensureModel(deps, module);
  return { engine: 'system', voice: 'downloading', reason: null, message: null };
}
