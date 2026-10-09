import { MUSIC_PPQ, type Song } from '@midnite/studio-shared';

import { barTicks } from './song-edit';

export type RulerLine = { tick: number; /** 1-based bar number; set on bar lines only. */ bar: number | null };

/**
 * Bar and beat lines between two ticks, following the song's time-signature changes. A signature
 * change restarts the bar at its tick, as MIDI does.
 */
export function rulerLines(
  signatures: Song['timeSignatures'],
  fromTick: number,
  toTick: number,
): RulerLine[] {
  const out: RulerLine[] = [];
  let barNumber = 1;
  const sigs = signatures.length ? signatures : [{ tick: 0, numerator: 4, denominator: 4 as const }];
  for (let s = 0; s < sigs.length; s++) {
    const sig = sigs[s]!;
    const segEnd = Math.min(toTick, sigs[s + 1]?.tick ?? Infinity);
    const bar = barTicks(sig.numerator, sig.denominator);
    const beat = Math.max(1, Math.round((MUSIC_PPQ * 4) / sig.denominator));
    // First beat line at or after `fromTick` within this segment.
    const first = Math.max(sig.tick, sig.tick + Math.ceil((fromTick - sig.tick) / beat) * beat);
    for (let tick = first; tick < segEnd; tick += beat) {
      const offset = tick - sig.tick;
      const isBar = offset % bar === 0;
      out.push({ tick, bar: isBar ? barNumber + offset / bar : null });
    }
    const next = sigs[s + 1];
    if (next) barNumber += Math.ceil((next.tick - sig.tick) / bar);
  }
  return out;
}

/** Ticks to show on the arrangement: the song plus a few bars of room, never under 8 bars. */
export function arrangementSpan(endTick: number, bar: number): number {
  return Math.max(bar * 8, Math.ceil((endTick + bar * 2) / bar) * bar);
}
