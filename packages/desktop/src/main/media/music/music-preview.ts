import { MUSIC_PPQ, type Song } from '@midnite/studio-shared';

import { encodePngRgba8 } from '../png/png-codec';

/**
 * A piano-roll picture of a bar range (Phase 101 Theme H's `music_render_preview`) — what an agent
 * looks at instead of reading note numbers. Pure pixels in main, no canvas and no renderer, so it works
 * with the editor closed: dark ground, a lane per semitone, beat and bar lines, and every track's notes
 * in its own colour (louder notes are more opaque).
 *
 * Bars are counted in the song's first time signature; a later change of signature does not move them.
 */
const BAR_PX = 240;
const ROW_PX = 6;
const MIN_ROWS = 24;
const PAD_ROWS = 2;

const BG = [18, 18, 24] as const;
const LANE_ALT = [24, 24, 32] as const;
const BEAT_LINE = [44, 44, 58] as const;
const BAR_LINE = [96, 96, 120] as const;
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

export type PianoRoll = { png: Buffer; width: number; height: number; fromBar: number; bars: number; pitchRange: [number, number] | null };

export const ticksPerBarOf = (song: Pick<Song, 'timeSignatures'>): number => {
  const sig = song.timeSignatures[0] ?? { numerator: 4, denominator: 4 };
  return Math.max(1, Math.round((MUSIC_PPQ * 4 * sig.numerator) / sig.denominator));
};

function hex(color: string): [number, number, number] {
  const n = Number.parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function renderPianoRoll(song: Song, fromBar: number, bars: number): PianoRoll {
  const perBar = ticksPerBarOf(song);
  const startTick = (fromBar - 1) * perBar;
  const endTick = startTick + bars * perBar;
  const beatTicks = Math.max(1, perBar / Math.max(1, song.timeSignatures[0]?.numerator ?? 4));

  let lo = 127;
  let hi = 0;
  for (const track of song.tracks) {
    for (const note of track.notes) {
      if (note.startTick + note.durationTicks <= startTick || note.startTick >= endTick) continue;
      lo = Math.min(lo, note.pitch);
      hi = Math.max(hi, note.pitch);
    }
  }
  const empty = hi < lo;
  const noteRange: [number, number] | null = empty ? null : [lo, hi];
  if (empty) {
    lo = 48;
    hi = 72;
  }
  lo = Math.max(0, lo - PAD_ROWS);
  hi = Math.min(127, hi + PAD_ROWS);
  while (hi - lo + 1 < MIN_ROWS) {
    if (lo > 0) lo -= 1;
    if (hi - lo + 1 < MIN_ROWS && hi < 127) hi += 1;
  }

  const width = bars * BAR_PX;
  const rows = hi - lo + 1;
  const height = rows * ROW_PX;
  const rgba = new Uint8Array(width * height * 4);
  const put = (x: number, y: number, c: readonly number[], a = 1): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    for (let k = 0; k < 3; k += 1) rgba[i + k] = Math.round(rgba[i + k]! * (1 - a) + c[k]! * a);
    rgba[i + 3] = 255;
  };
  const xOf = (tick: number): number => Math.round(((tick - startTick) / perBar) * BAR_PX);
  const yOf = (pitch: number): number => (hi - pitch) * ROW_PX;

  for (let pitch = lo; pitch <= hi; pitch += 1) {
    const bg = BLACK_KEYS.has(pitch % 12) ? LANE_ALT : BG;
    for (let dy = 0; dy < ROW_PX; dy += 1) for (let x = 0; x < width; x += 1) put(x, yOf(pitch) + dy, bg);
  }
  for (let t = startTick; t <= endTick; t += beatTicks) {
    const x = Math.min(width - 1, xOf(t));
    const isBar = Math.round(t - startTick) % perBar === 0;
    for (let y = 0; y < height; y += 1) put(x, y, isBar ? BAR_LINE : BEAT_LINE);
  }
  for (const track of song.tracks) {
    const color = hex(track.color);
    for (const note of track.notes) {
      if (note.pitch < lo || note.pitch > hi) continue;
      if (note.startTick + note.durationTicks <= startTick || note.startTick >= endTick) continue;
      const x0 = Math.max(0, xOf(note.startTick));
      const x1 = Math.min(width - 1, Math.max(x0 + 1, xOf(note.startTick + note.durationTicks) - 1));
      const alpha = 0.45 + 0.55 * (note.velocity / 127);
      for (let y = yOf(note.pitch) + 1; y < yOf(note.pitch) + ROW_PX; y += 1) for (let x = x0; x <= x1; x += 1) put(x, y, color, alpha);
    }
  }
  return { png: encodePngRgba8(rgba, width, height), width, height, fromBar, bars, pitchRange: noteRange };
}
