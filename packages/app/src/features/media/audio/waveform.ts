/**
 * Waveform peaks for the session cards (Phase 99 Theme E). Computed once per
 * variant with the Web Audio API and cached in the variant's sidecar, so a
 * card only ever decodes a file the first time it is seen.
 */

/** Bars per thumbnail — enough for a card, small enough to live in a JSON sidecar. */
export const WAVEFORM_BUCKETS = 96;

/**
 * Reduce decoded channel data to `buckets` peaks in 0..1: the loudest absolute
 * sample across every channel within each bucket, normalised so the loudest
 * bucket is 1. Silence stays all zeros rather than dividing by zero.
 */
export function reducePeaks(channels: readonly Float32Array[], buckets = WAVEFORM_BUCKETS): number[] {
  const length = channels.reduce((max, c) => Math.max(max, c.length), 0);
  if (length === 0 || buckets <= 0) return [];
  const count = Math.min(buckets, length);
  const size = length / count;
  const peaks: number[] = [];
  for (let b = 0; b < count; b++) {
    const start = Math.floor(b * size);
    const end = Math.max(start + 1, Math.floor((b + 1) * size));
    let peak = 0;
    for (const channel of channels) {
      for (let i = start; i < end && i < channel.length; i++) {
        const v = Math.abs(channel[i]!);
        if (v > peak) peak = v;
      }
    }
    peaks.push(peak);
  }
  const max = Math.max(...peaks);
  return max > 0 ? peaks.map((p) => Math.round((p / max) * 1000) / 1000) : peaks.map(() => 0);
}

export type Waveform = { peaks: number[]; durationS: number };

/** Fetch + decode `url` and reduce it. `null` where Web Audio is unavailable or the file will not decode. */
export async function computeWaveform(url: string, buckets = WAVEFORM_BUCKETS): Promise<Waveform | null> {
  const Ctx = globalThis.OfflineAudioContext;
  if (typeof Ctx !== 'function') return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await new Ctx(1, 1, 44_100).decodeAudioData(await res.arrayBuffer());
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    return { peaks: reducePeaks(channels, buckets), durationS: Math.round(buffer.duration * 100) / 100 };
  } catch {
    return null;
  }
}

/** `125.4` → `2:05`. */
export function formatDuration(seconds: number | undefined | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '–:––';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** Bars before the playhead: `progress` (0..1, clamped) of `count` bars, floored. */
export function playedBarCount(progress: number, count: number): number {
  if (!Number.isFinite(progress) || count <= 0) return 0;
  return Math.floor(Math.min(1, Math.max(0, progress)) * count);
}
