/**
 * Re-encode a recorded utterance as WAV PCM before it crosses the IPC
 * boundary (Ad Hoc: the microphone must work with no API key).
 *
 * `voice-ports.ts`'s `finishRecording` hands `recorder.ts`'s
 * `audio/webm;codecs=opus` blob to this before calling `transcribe` — the
 * local recogniser (`sherpa-local.ts`, main) needs raw PCM samples, not a
 * compressed container, and `stt/types.ts`'s own doc gives the reason a
 * decoder does not belong in *main*: it would drag a dependency in for the
 * same job Chromium already does. This decodes with the browser's own
 * `AudioContext` instead — the identical engine that just encoded the opus
 * bytes in the first place — so neither process gains a new dependency.
 *
 * One wire format for both providers, not a parallel one for the local
 * engine alone: `openai-whisper` already accepts `audio/wav`
 * (`whisperFilename`'s existing `wav`/`x-wav`/`wave` cases), so re-encoding
 * here changes nothing about what the cloud provider receives semantically —
 * the same decoded audio, just uncompressed.
 *
 * **Fails open.** No `AudioContext` (an old build, a non-Electron test
 * environment), an empty recording, or a `decodeAudioData` rejection (a
 * genuinely corrupt capture) all fall back to the original blob untouched —
 * `openai-whisper` still reads it exactly as before, and the local provider's
 * own `looksLikeWav` guard reports the honest reason a fallback-shaped
 * recording can't be read locally rather than this module inventing a second
 * failure mode.
 */
export async function toWavBlob(blob: Blob): Promise<Blob> {
  if (blob.size === 0) return blob;

  const AudioCtx = audioContextCtor();
  if (AudioCtx === null) return blob;

  let ctx: AudioContext;
  try {
    ctx = new AudioCtx();
  } catch {
    return blob;
  }

  try {
    const arrayBuffer = await blob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    const samples = toMono(decoded);
    // `.buffer`, not the `Uint8Array` view itself: `BlobPart` wants an
    // `ArrayBuffer`, and `encodeWav`'s return type is generic over
    // `ArrayBufferLike` (which also covers `SharedArrayBuffer`) — the same
    // reason `openai-whisper.ts` does this for its own freshly-built buffer.
    return new Blob([encodeWav(samples, decoded.sampleRate).buffer as ArrayBuffer], {
      type: 'audio/wav',
    });
  } catch {
    return blob;
  } finally {
    void ctx.close().catch(() => {});
  }
}

function audioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return typeof ctor === 'function' ? ctor : null;
}

/** Downmix to mono by averaging channels — `acceptWaveform` on the main side takes one channel. */
export function toMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels <= 1) return buffer.getChannelData(0);
  const mixed = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < buffer.length; index += 1) {
      mixed[index] = (mixed[index] ?? 0) + data[index]! / buffer.numberOfChannels;
    }
  }
  return mixed;
}

/**
 * 16-bit PCM mono WAV — the identical byte layout `stt/index.ts`'s
 * `silentWavClip` and `tts.ts`'s `encodeWav` both build on the main side.
 * Kept as its own copy here rather than imported: `app` may not import
 * `desktop` (package boundaries), and this is one small, stable format, not a
 * dependency worth an IPC channel of its own.
 */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
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
