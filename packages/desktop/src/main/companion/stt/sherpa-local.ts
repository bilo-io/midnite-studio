import { existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import bz2 from 'unbzip2-stream';

import { failure, ok, type GitOpResult } from '@midnite/studio-shared';

import { SttError, type SttProvider } from './types';

/**
 * The local, key-free speech recogniser (Ad Hoc: "the microphone must work
 * with no API key").
 *
 * `openai-whisper` was the only implemented `SttProviderId`, and it needs a
 * paid key before the mic button does anything at all. This is the second
 * implementation `stt/index.ts`'s own doc comment says should exist to prove
 * the interface isn't shaped around one vendor — and it is the one that ships
 * as `DEFAULT_STT_PROVIDER_ID` (`companion.ts`), because the mic has to work
 * before anyone opens Settings.
 *
 * **`sherpa-onnx-node`, not a new dependency.** `companion/tts.ts` already
 * depends on it (and its `sherpa-onnx-darwin-arm64` prebuilt binary) for the
 * local voice *out* — this reuses the exact same native module and ABI for
 * voice *in*, via its `OfflineRecognizer`. If `feature/kokoro-tts` (running
 * alongside this branch) drops `sherpa-onnx-node` when it replaces the TTS
 * engine with `kokoro-js`, this module still needs it — see the PR body for
 * the coordination note.
 *
 * **The model: a quantized `whisper-tiny.en`**, from sherpa-onnx's own
 * pre-converted `asr-models` release — the same model *architecture* the
 * `openai-whisper` provider calls out to OpenAI for, just running on this
 * machine instead of theirs. The int8 encoder+decoder+tokens come to about
 * 103 MB on disk (12 MB + 90 MB + 0.8 MB, measured against the actual
 * release asset), comfortably inside typical push-to-talk latency: a 3.5 s
 * utterance transcribed in ~290 ms once the ~285 ms model load has happened
 * once per process (measured on this machine; see the PR body for the full
 * figures). `base.en` and `small.en` exist in the same release for anyone who
 * wants to trade size for accuracy later — `tiny.en` is the one that keeps
 * the download in the same ballpark as `tts.ts`'s own ~77 MB voice.
 *
 * **Follows `tts.ts` line for line**: a native module, main-process-only,
 * loaded lazily inside a `try`/`catch` so an unsupported platform degrades to
 * "this provider is unavailable" rather than crashing main at boot; a model
 * downloaded once into `app.getPath('userData')/companion-stt/`, never into
 * the app bundle or the repo; a sticky failure for a missing native module or
 * a broken model, a *non*-sticky one for a transient download failure. Every
 * failure mode answers a throw `stt/index.ts` maps to `{ok:false}` — this
 * module never returns anything else on its own, matching {@link SttProvider}.
 *
 * **The audio must already be WAV**, not the `audio/webm;codecs=opus` bytes
 * `MediaRecorder` produces — `OfflineRecognizer` takes raw PCM samples, not a
 * compressed container, and decoding opus in *main* would drag a decoder
 * dependency in for exactly the reason `stt/types.ts`'s own doc gives for
 * *not* doing that to Whisper's webm. Chromium already has a decoder for the
 * same audio it just encoded, so `voice-ports.ts` decodes client-side via
 * `AudioContext.decodeAudioData` before either provider ever sees the bytes —
 * `openai-whisper` already accepts `audio/wav` (see `whisperFilename`), so
 * this is one wire format for both providers, not a parallel one for this
 * provider alone.
 */

const MODEL_ID = 'whisper-tiny.en-int8';
/** github.com/k2-fsa/sherpa-onnx's `asr-models` release. */
const MODEL_TARBALL_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.en.tar.bz2';
const TARBALL_ROOT = 'sherpa-onnx-whisper-tiny.en';
/** The tarball also ships fp32 weights and test wavs this module never reads. */
const ENCODER_NAME = 'tiny.en-encoder.int8.onnx';
const DECODER_NAME = 'tiny.en-decoder.int8.onnx';
const TOKENS_NAME = 'tiny.en-tokens.txt';

/** ~110 MB compressed — generous over `tts.ts`'s 120 s for a smaller voice download. */
const DOWNLOAD_TIMEOUT_MS = 180_000;

type SherpaOnnxAsrModule = typeof import('sherpa-onnx-node');
type OfflineRecognizerInstance = InstanceType<SherpaOnnxAsrModule['OfflineRecognizer']>;

export type CompanionLocalSttDeps = {
  /** `app.getPath('userData')`, injected so this module carries no `electron` import. */
  directory: string;
  fetchImpl: typeof fetch;
  /** `require('sherpa-onnx-node')` — injected for the reason `tts.ts`'s `loadModule` is. */
  loadModule: () => SherpaOnnxAsrModule;
};

function requireSherpaOnnx(): SherpaOnnxAsrModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('sherpa-onnx-node') as SherpaOnnxAsrModule;
}

function defaultDeps(directory: string): CompanionLocalSttDeps {
  return { directory, fetchImpl: fetch, loadModule: requireSherpaOnnx };
}

let configured: CompanionLocalSttDeps | null = null;
let sherpaOnnx: SherpaOnnxAsrModule | null = null;
let recognizerPromise: Promise<OfflineRecognizerInstance> | null = null;
/** Sticky once set — mirrors `tts.ts`'s own claim: a missing binary does not become available mid-run. */
let loadFailure: string | null = null;
let loadFailureKind: 'native-module-missing' | 'recognition-error' | null = null;
/** Not sticky: a network blip is retried on the next call, same as `tts.ts`'s `provisioningError`. */
let provisioning: Promise<GitOpResult<ModelPaths>> | null = null;
let provisioningError: string | null = null;

/** Injected at boot beside `configureStt`, with `app.getPath('userData')`. */
export function configureLocalStt(directory: string): void {
  configured = defaultDeps(directory);
}

export function localSttDeps(): CompanionLocalSttDeps | null {
  return configured;
}

/** Reset module state. Tests only. */
export function resetLocalSttForTest(overrides: Partial<CompanionLocalSttDeps> = {}): void {
  sherpaOnnx = null;
  recognizerPromise = null;
  loadFailure = null;
  loadFailureKind = null;
  provisioning = null;
  provisioningError = null;
  configured = overrides.directory !== undefined ? defaultDeps(overrides.directory) : null;
  if (configured) {
    if (overrides.fetchImpl !== undefined) configured.fetchImpl = overrides.fetchImpl;
    if (overrides.loadModule !== undefined) configured.loadModule = overrides.loadModule;
  }
}

type ModelPaths = { encoderPath: string; decoderPath: string; tokensPath: string };

function modelDir(directory: string): string {
  return join(directory, 'companion-stt', MODEL_ID);
}

function modelPaths(directory: string): ModelPaths {
  const dir = modelDir(directory);
  return {
    encoderPath: join(dir, ENCODER_NAME),
    decoderPath: join(dir, DECODER_NAME),
    tokensPath: join(dir, TOKENS_NAME),
  };
}

function modelReady(paths: ModelPaths): boolean {
  return existsSync(paths.encoderPath) && existsSync(paths.decoderPath) && existsSync(paths.tokensPath);
}

/**
 * `loadSherpaOnnx` in `tts.ts`, restated: lazy, fail-soft, sticky. Kept as its
 * own copy rather than imported from `tts.ts` — that file is owned by the
 * concurrent TTS-engine swap and may not exist by the time this merges.
 */
function loadSherpaOnnx(deps: CompanionLocalSttDeps): SherpaOnnxAsrModule | null {
  if (loadFailure !== null) return null;
  if (sherpaOnnx) return sherpaOnnx;
  try {
    sherpaOnnx = deps.loadModule();
    return sherpaOnnx;
  } catch (error) {
    loadFailure = error instanceof Error ? error.message : 'sherpa-onnx-node failed to load';
    loadFailureKind = 'native-module-missing';
    return null;
  }
}

// --- a minimal tar/bz2 reader, mirroring `tts.ts`'s own (see that file's doc) ---

async function collectStream(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of Readable.fromWeb(stream as never)) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

function bunzip2(compressed: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const decompressor = bz2();
    decompressor.on('data', (chunk: Buffer) => chunks.push(chunk));
    decompressor.on('end', () => resolve(Buffer.concat(chunks)));
    decompressor.on('error', reject);
    decompressor.end(compressed);
  });
}

async function extractTar(
  buffer: Buffer,
  destDir: string,
  strip: string,
  keep: (relativeName: string) => boolean,
): Promise<void> {
  let offset = 0;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const rawName = header.toString('utf8', 0, 100).replace(/\0.*$/s, '');
    const sizeField = header.toString('utf8', 124, 136).replace(/\0.*$/s, '').trim();
    const size = sizeField.length > 0 ? parseInt(sizeField, 8) : 0;
    const typeflag = String.fromCharCode(header[156] ?? 0);
    offset += 512;

    const prefix = `${strip}/`;
    const relative = rawName.startsWith(prefix) ? rawName.slice(prefix.length) : null;

    if (relative !== null && relative.length > 0 && keep(relative)) {
      const dest = join(destDir, relative);
      if (typeflag === '5') {
        await mkdir(dest, { recursive: true });
      } else if (typeflag === '0' || typeflag === '\0') {
        await mkdir(join(dest, '..'), { recursive: true });
        await writeFile(dest, buffer.subarray(offset, offset + size));
      }
    }

    offset += Math.ceil(size / 512) * 512;
  }
}

/**
 * Download and extract the model, into a temp directory first and `rename()`d
 * into place last — a download killed mid-write never leaves `modelReady()`
 * reading a half-written model as present. Deduped through the module-level
 * `provisioning` promise, exactly as `tts.ts`'s `ensureVoice` is.
 */
async function ensureModel(deps: CompanionLocalSttDeps): Promise<GitOpResult<ModelPaths>> {
  const paths = modelPaths(deps.directory);
  if (modelReady(paths)) {
    provisioningError = null;
    return ok(paths);
  }

  if (provisioning === null) {
    provisioningError = null;
    provisioning = (async (): Promise<GitOpResult<ModelPaths>> => {
      const dir = modelDir(deps.directory);
      const tempDir = `${dir}.download-${Date.now()}`;
      try {
        const response = await deps.fetchImpl(MODEL_TARBALL_URL, {
          signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        });
        if (!response.ok || response.body === null) {
          provisioningError = `Could not download the offline speech model (HTTP ${response.status}).`;
          return failure(provisioningError);
        }
        const compressed = await collectStream(response.body);
        const archive = await bunzip2(compressed);

        await mkdir(tempDir, { recursive: true });
        await extractTar(
          archive,
          tempDir,
          TARBALL_ROOT,
          (name) => name === ENCODER_NAME || name === DECODER_NAME || name === TOKENS_NAME,
        );

        await rm(dir, { recursive: true, force: true });
        await rename(tempDir, dir);
        if (modelReady(paths)) {
          provisioningError = null;
          return ok(paths);
        }
        provisioningError = 'The downloaded speech model was incomplete.';
        return failure(provisioningError);
      } catch (error) {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
        provisioningError = `Could not set up the offline speech model (${error instanceof Error ? error.message : String(error)}).`;
        return failure(provisioningError);
      } finally {
        provisioning = null;
      }
    })();
  }
  return provisioning;
}

/**
 * Read the fixed-shape WAV `voice-ports.ts`'s `toWavBlob` always produces —
 * 16-bit PCM mono, a plain 44-byte header, no extra chunks — not a general
 * WAV parser.
 *
 * `sherpa-onnx-node`'s native addon *does* export a `readWaveFromBinary`
 * (confirmed against the installed 1.13.7 binary), but the package's public
 * JS API only re-exports `readWave` (from a file path) and `writeWave` —
 * reaching past that into `addon.js`'s internals for one function is exactly
 * the kind of native-internals coupling `tts.ts`'s own module doc argues
 * against for the sibling engine. Parsing the 44 bytes this app's own
 * encoder always writes is the same call `silentWavClip`/`encodeWav` already
 * made for the other WAV shapes in this codebase: no audio assets, no
 * dependency, because the format is fully known and small.
 */
function parseWav(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleRate = view.getUint32(24, true);
  const dataSize = view.getUint32(40, true);
  const sampleCount = Math.max(0, Math.floor(dataSize / 2));
  const samples = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    const int16 = view.getInt16(44 + index * 2, true);
    samples[index] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7fff;
  }
  return { samples, sampleRate };
}

function buildRecognizer(
  module: SherpaOnnxAsrModule,
  paths: ModelPaths,
): Promise<OfflineRecognizerInstance> {
  return module.OfflineRecognizer.createAsync({
    featConfig: { sampleRate: 16_000, featureDim: 80 },
    modelConfig: {
      whisper: { encoder: paths.encoderPath, decoder: paths.decoderPath, language: 'en', task: 'transcribe' },
      tokens: paths.tokensPath,
      numThreads: 1,
      provider: 'cpu',
    },
  });
}

/**
 * Whisper's own habit of narrating near-silence rather than transcribing
 * nothing (`"[ Silence ]"`, `"[BLANK_AUDIO]"`, …) — confirmed against this
 * model with a real one-second silent clip during manual verification, not
 * assumed. Left as the empty string, which `finishRecording` already reports
 * as "I did not catch that" — the honest outcome for that recording.
 */
const NON_SPEECH_PATTERN = /^[[(]\s*(silence|blank_audio|no speech.*|music|inaudible|noise)\s*[\])]$/i;

function stripNonSpeech(text: string): string {
  const trimmed = text.trim();
  return NON_SPEECH_PATTERN.test(trimmed) ? '' : trimmed;
}

/** The first four bytes of a RIFF/WAVE file — what `voice-ports.ts` always sends this provider. */
function looksLikeWav(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 // F
  );
}

/**
 * Resolve when `promise` does, reject the moment `signal` aborts — the native
 * decode itself cannot be interrupted mid-flight, but the promise this
 * provider hands back to `transcribeUtterance` must still settle at the 15 s
 * mark rather than hang until a multi-minute CPU decode finishes on its own.
 */
function raceAbort<T>(signal: AbortSignal, promise: Promise<T>): Promise<T> {
  if (signal.aborted) return Promise.reject(new SttError('Transcription was cancelled.'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(new SttError('Transcription was cancelled.'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

/** `stt/index.ts`'s `STT_PROVIDER_FACTORIES['whisper-local']`. The key argument is unused — see the module doc. */
export function createLocalWhisperProvider(
  _key: string,
  deps: CompanionLocalSttDeps | null = configured,
): SttProvider {
  return {
    id: 'whisper-local',
    transcribe: async (audio, _mime, signal) => {
      if (deps === null) {
        throw new SttError('The offline speech engine is not set up yet.');
      }
      if (!looksLikeWav(audio)) {
        throw new SttError(
          "This recording could not be read by the offline engine.",
          'Try again, or switch to OpenAI Whisper in Settings, Companion, Microphone.',
        );
      }

      const module = loadSherpaOnnx(deps);
      if (module === null) {
        throw new SttError(
          'The offline speech engine is unavailable on this machine.',
          'Switch to OpenAI Whisper in Settings, Companion, Microphone.',
        );
      }

      const provisioned = await ensureModel(deps);
      if (!provisioned.ok) {
        throw new SttError(provisioned.kind === 'error' ? provisioned.message : 'Could not set up the offline speech model.');
      }

      if (recognizerPromise === null) {
        recognizerPromise = buildRecognizer(module, provisioned.value).catch((error: unknown) => {
          recognizerPromise = null;
          loadFailure = error instanceof Error ? error.message : 'sherpa-onnx-node failed';
          loadFailureKind = 'recognition-error';
          throw error;
        });
      }

      try {
        const recognizer = await raceAbort(signal, recognizerPromise);
        const wave = parseWav(audio);
        const stream = recognizer.createStream();
        stream.acceptWaveform(wave);
        const result = await raceAbort(signal, recognizer.decodeAsync(stream));
        return stripNonSpeech(result.text);
      } catch (error) {
        if (error instanceof SttError) throw error;
        loadFailure = error instanceof Error ? error.message : 'sherpa-onnx-node failed';
        loadFailureKind = 'recognition-error';
        throw new SttError(
          `The offline speech engine failed to transcribe that recording (${error instanceof Error ? error.message : String(error)}).`,
        );
      }
    },
  };
}

export type LocalSttStatusValue = {
  state: 'idle' | 'downloading' | 'ready' | 'failed';
  reason: 'native-module-missing' | 'download-failed' | 'recognition-error' | null;
  message: string | null;
};

/**
 * A snapshot of the local engine's health for the mic tooltip and Settings ▸
 * Companion ▸ Microphone (requirement: "any one-time model download must be
 * surfaced, not silent") — never throws, never transcribes anything, and by
 * default never re-attempts a provisioning download that already failed.
 * Mirrors `tts.ts`'s `getCompanionTtsStatus` one for one, minus the
 * `engine`/fallback-tier field TTS needs and STT does not: an STT failure
 * falls back to whichever *other provider* the user configured, not to a
 * lesser tier of the same one.
 */
export async function getLocalWhisperStatus(
  retry: boolean,
  deps: CompanionLocalSttDeps | null = configured,
): Promise<LocalSttStatusValue> {
  if (deps === null) {
    return { state: 'idle', reason: null, message: null };
  }

  const module = loadSherpaOnnx(deps);
  if (module === null) {
    return { state: 'failed', reason: loadFailureKind ?? 'native-module-missing', message: loadFailure };
  }

  const paths = modelPaths(deps.directory);
  if (modelReady(paths)) {
    return { state: 'ready', reason: null, message: null };
  }

  if (provisioning !== null) {
    return { state: 'downloading', reason: null, message: null };
  }

  if (provisioningError !== null && !retry) {
    return { state: 'failed', reason: 'download-failed', message: provisioningError };
  }

  void ensureModel(deps);
  return { state: 'downloading', reason: null, message: null };
}
