/** Mono PCM helpers for stitching MusicGen sections into one track and writing it as WAV. */

export function equalPowerCrossfade(a: Float32Array, b: Float32Array, overlap: number): Float32Array {
  const n = Math.max(0, Math.min(overlap, a.length, b.length));
  const out = new Float32Array(a.length + b.length - n);
  out.set(a.subarray(0, a.length - n), 0);
  for (let i = 0; i < n; i += 1) {
    const t = n === 1 ? 1 : i / (n - 1);
    out[a.length - n + i] = a[a.length - n + i]! * Math.cos((t * Math.PI) / 2) + b[i]! * Math.sin((t * Math.PI) / 2);
  }
  out.set(b.subarray(n), a.length);
  return out;
}

export function stitch(chunks: readonly Float32Array[], overlap: number): Float32Array {
  if (chunks.length === 0) return new Float32Array(0);
  return chunks.slice(1).reduce((acc, next) => equalPowerCrossfade(acc, next, overlap), chunks[0]!);
}

/**
 * Scale so the loudest sample sits at `ceiling`, and ease the edges: a short
 * fade-in hides the model's start-of-clip click, a longer fade-out ends the
 * track instead of cutting it. Silence is returned untouched.
 */
export function finishTrack(samples: Float32Array, sampleRate: number, ceiling = 0.92): Float32Array {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? ceiling / peak : 1;
  const out = new Float32Array(samples.length);
  const fadeIn = Math.min(Math.round(sampleRate * 0.02), samples.length);
  const fadeOut = Math.min(Math.round(sampleRate * 0.75), samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    let g = gain;
    if (i < fadeIn) g *= i / fadeIn;
    const tail = samples.length - 1 - i;
    if (tail < fadeOut) g *= tail / fadeOut;
    out[i] = samples[i]! * g;
  }
  return out;
}

/** 16-bit PCM mono WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVEfmt ', 8, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const v = Math.max(-1, Math.min(1, samples[i]!));
    buf.writeInt16LE(Math.round(v < 0 ? v * 0x8000 : v * 0x7fff), 44 + i * 2);
  }
  return buf;
}
