import {
  MUSIC_PPQ,
  type SongTempoEvent,
  type SongTimeSignatureEvent,
} from '@midnite/studio-shared';

/**
 * Tempo-map-aware tick <-> seconds conversion (Phase 101 Theme C). Pure: no Tone, no DOM.
 * Tempo is piecewise constant, so each segment is a straight line in (tick, seconds).
 */
export type TickMap = {
  ticksToSeconds: (tick: number) => number;
  secondsToTicks: (seconds: number) => number;
};

const DEFAULT_TEMPOS: readonly SongTempoEvent[] = [{ tick: 0, bpm: 120 }];

export function createTickMap(tempos: readonly SongTempoEvent[], ppq = MUSIC_PPQ): TickMap {
  const events =
    tempos.length > 0 ? [...tempos].sort((a, b) => a.tick - b.tick) : [...DEFAULT_TEMPOS];
  if (events[0]!.tick !== 0) events.unshift({ tick: 0, bpm: events[0]!.bpm });
  // secondsAt[i] = seconds at events[i].tick
  const secondsAt: number[] = [0];
  for (let i = 1; i < events.length; i += 1) {
    const prev = events[i - 1]!;
    secondsAt.push(secondsAt[i - 1]! + ((events[i]!.tick - prev.tick) * 60) / (prev.bpm * ppq));
  }
  const ticksToSeconds = (tick: number): number => {
    let lo = 0;
    for (let i = events.length - 1; i >= 0; i -= 1) {
      if (events[i]!.tick <= tick) {
        lo = i;
        break;
      }
    }
    const e = events[lo]!;
    return secondsAt[lo]! + (Math.max(0, tick - e.tick) * 60) / (e.bpm * ppq);
  };
  const secondsToTicks = (seconds: number): number => {
    let lo = 0;
    for (let i = events.length - 1; i >= 0; i -= 1) {
      if (secondsAt[i]! <= seconds) {
        lo = i;
        break;
      }
    }
    const e = events[lo]!;
    return e.tick + (Math.max(0, seconds - secondsAt[lo]!) * e.bpm * ppq) / 60;
  };
  return { ticksToSeconds, secondsToTicks };
}

export type MetronomeClick = { tick: number; accent: boolean };

/** Every beat from tick 0 up to `endTick`, the first of each bar accented. Honors time-signature changes. */
export function metronomeClicks(
  signatures: readonly SongTimeSignatureEvent[],
  endTick: number,
  ppq = MUSIC_PPQ,
): MetronomeClick[] {
  const sigs =
    signatures.length > 0
      ? [...signatures].sort((a, b) => a.tick - b.tick)
      : [{ tick: 0, numerator: 4, denominator: 4 as const }];
  const clicks: MetronomeClick[] = [];
  let tick = 0;
  let sigIndex = 0;
  while (tick < endTick) {
    while (sigIndex + 1 < sigs.length && sigs[sigIndex + 1]!.tick <= tick) sigIndex += 1;
    const sig = sigs[sigIndex]!;
    const beatTicks = (ppq * 4) / sig.denominator;
    const barEnd = tick + beatTicks * sig.numerator;
    for (let beat = 0; beat < sig.numerator && tick < endTick; beat += 1) {
      clicks.push({ tick, accent: beat === 0 });
      tick += beatTicks;
    }
    tick = Math.max(tick, barEnd);
    if (clicks.length > 200_000) break;
  }
  return clicks;
}
