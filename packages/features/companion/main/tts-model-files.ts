import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where the local voice's model lives on disk, and whether it is there —
 * split out of `tts.ts` (Phase 109 Theme D) so main can answer "is the local
 * voice downloaded?" for `companion_voices_list` without loading `tts.ts`'s
 * engine, spawning the TTS worker, or starting a download. `tts.ts` itself
 * runs in the `companion-tts-worker` utility process; this file has no state
 * and imports nothing but `node:fs`/`node:path`.
 */

/** `kokoro-js`'s own default ONNX export of Kokoro-82M v1.0 on the Hugging Face Hub. */
export const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

/** The on-disk file `dtype: 'q8'` resolves to — used only by {@link kokoroModelOnDisk}'s cheap existence check. */
export const KOKORO_QUANTIZED_MODEL_FILE = 'model_quantized.onnx';

/**
 * Under `app.getPath('userData')`, never `transformers.js`'s own default
 * `<package>/.cache/` (unwritable once packaged into an asar) nor the user's
 * home dotfiles — `tts.ts`'s module doc, point 2, and the exact failure mode
 * that already burned this feature once.
 */
export function kokoroModelCacheDir(directory: string): string {
  return join(directory, 'companion-voice', 'kokoro');
}

/**
 * A cheap on-disk existence check, mirroring the old `voiceReady()` — cheap
 * enough for `getCompanionTtsStatus` to poll without spinning up a full ONNX
 * session just to answer a Settings page. `transformers.js`'s `FileCache`
 * joins `env.cacheDir` with `${model_id}/${filename}` verbatim (no revision
 * segment) — empirically confirmed against this build's own cache directory
 * — so the path below is deterministic for the fixed model id and `q8` dtype
 * `tts.ts` always requests. Every Kokoro voice ships inside `kokoro-js`
 * itself, so the model is the only download a local voice waits on.
 */
export function kokoroModelOnDisk(directory: string): boolean {
  const dir = kokoroModelCacheDir(directory);
  return (
    existsSync(join(dir, KOKORO_MODEL_ID, 'onnx', KOKORO_QUANTIZED_MODEL_FILE)) &&
    existsSync(join(dir, KOKORO_MODEL_ID, 'tokenizer.json')) &&
    existsSync(join(dir, KOKORO_MODEL_ID, 'config.json'))
  );
}
