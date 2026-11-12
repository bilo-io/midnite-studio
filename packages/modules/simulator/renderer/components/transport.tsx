import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { LuDices, LuPause, LuPlay, LuRotateCcw, LuStepForward } from 'react-icons/lu';

import { useFrameChrome } from '@midnite/studio-frame';

import { SPEEDS, type TicksPerFrame } from '../engine/types';

export type TransportProps = {
  playing: boolean;
  onPlay(): void;
  onPause(): void;
  onStep(): void;
  onReset(): void;
  speed: TicksPerFrame;
  onSpeed(speed: TicksPerFrame): void;
  seed: number;
  /** Called with the new seed on Enter in the field, or from the dice button. */
  onSeed(seed: number): void;
  tick: number;
  stats: Record<string, number>;
};

const speedLabel = (s: TicksPerFrame) => `${s}×`;

/** A fresh 32-bit seed for the dice button. Not a sim draw, so `Math.random` is fine here. */
export const freshSeed = () => Math.floor(Math.random() * 0x100000000);

/** Play, pause, step, reset, speed, seed and the tick read-out for any sandbox (Phase 127 Theme B.3). */
export function Transport(p: TransportProps) {
  const { IconButton } = useFrameChrome();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const n = Number(draft);
    setDraft(null);
    if (Number.isInteger(n) && n >= 0 && n < 0x100000000) p.onSeed(n);
  };
  const readout = Object.entries(p.stats)
    .filter(([k]) => k !== 'tick' && k !== 'droppedTicks')
    .map(([k, v]) => `${k} ${Math.round(v * 1000) / 1000}`);
  return (
    <div role="toolbar" aria-label="Simulation transport" className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-sm">
      <IconButton icon={p.playing ? LuPause : LuPlay} label={p.playing ? 'Pause' : 'Play'} onClick={p.playing ? p.onPause : p.onPlay} />
      <IconButton icon={LuStepForward} label="Step" onClick={p.onStep} disabled={p.playing} />
      <IconButton icon={LuRotateCcw} label="Reset" onClick={p.onReset} />
      <select
        aria-label="Speed"
        className="rounded border border-border bg-background px-1 py-0.5"
        value={p.speed}
        onChange={(e) => p.onSpeed(Number(e.target.value) as TicksPerFrame)}
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {speedLabel(s)}
          </option>
        ))}
      </select>
      <input
        aria-label="Seed"
        inputMode="numeric"
        className="w-28 rounded border border-border bg-background px-1 py-0.5 tabular-nums"
        value={draft ?? String(p.seed)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') setDraft(null);
        }}
        onBlur={() => setDraft(null)}
      />
      <IconButton icon={LuDices} label="New seed" onClick={() => p.onSeed(freshSeed())} />
      <span className="ml-auto tabular-nums text-muted-foreground">{['tick ' + p.tick, ...readout].join(' · ')}</span>
    </div>
  );
}

/**
 * The sandbox canvas's focusable wrapper: **Space** toggles play and **.** steps once while paused. A
 * canvas-local handler rather than a `CommandId`, so it never competes with the app's chords.
 */
export function SimCanvasFrame(p: { playing: boolean; onPlay(): void; onPause(): void; onStep(): void; children: ReactNode }) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === ' ') {
      e.preventDefault();
      if (p.playing) p.onPause();
      else p.onPlay();
    } else if (e.key === '.' && !p.playing) p.onStep();
  };
  return (
    <div tabIndex={0} role="application" aria-label="Simulation canvas" onKeyDown={onKeyDown} className="outline-none focus-visible:ring-1 focus-visible:ring-ring">
      {p.children}
    </div>
  );
}
