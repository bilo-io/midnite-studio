import type { Song } from '@midnite/studio-shared';
import { useEffect, useState } from 'react';
import { LuPause, LuPlay, LuRepeat, LuSquare, LuTimer } from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';
import { publishLoopRegion } from './editor-session';
import type { EngineState, MusicEngine } from './engine/engine';

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (seconds: number) =>
  `${pad(Math.floor(seconds / 60))}:${pad(Math.floor(seconds % 60))}.${Math.floor((seconds % 1) * 10)}`;

/** Transport for the Editor tab (Phase 101 Theme C): play/pause, stop, loop, metronome, tempo and clock. */
export function TransportBar({
  engine,
  state,
  song,
}: {
  engine: MusicEngine | null;
  state: EngineState;
  song: Song;
}) {
  const [seconds, setSeconds] = useState(0);
  const [loop, setLoop] = useState(false);
  const [click, setClick] = useState(false);

  useEffect(() => {
    if (!engine || state !== 'playing') return;
    const id = window.setInterval(() => setSeconds(engine.getPositionSeconds()), 100);
    return () => window.clearInterval(id);
  }, [engine, state]);
  useEffect(() => {
    if (state === 'stopped') setSeconds(0);
  }, [state]);

  const ready = engine !== null;
  const bpm = song.tempos[0]?.bpm ?? 120;
  const sig = song.timeSignatures[0];
  const btn = (on: boolean) => (on ? 'bg-accent text-foreground' : '');
  return (
    <div
      data-testid="music-transport"
      className="flex items-center gap-1 border-b border-border px-3 py-1.5"
    >
      <IconButton
        icon={state === 'playing' ? LuPause : LuPlay}
        label={state === 'playing' ? 'Pause' : 'Play'}
        disabled={!ready}
        onClick={() => (state === 'playing' ? engine?.pause() : void engine?.play())}
      />
      <IconButton
        icon={LuSquare}
        label="Stop"
        disabled={!ready || state === 'stopped'}
        onClick={() => engine?.stop()}
      />
      <IconButton
        icon={LuRepeat}
        label={loop ? 'Loop on' : 'Loop'}
        disabled={!ready}
        className={btn(loop)}
        onClick={() => {
          const next = !loop;
          setLoop(next);
          const region = next
            ? {
                startTick: 0,
                endTick: Math.max(
                  1,
                  song.tracks
                    .flatMap((t) => t.notes)
                    .reduce((m, n) => Math.max(m, n.startTick + n.durationTicks), 0),
                ),
              }
            : null;
          engine?.setLoop(region);
          publishLoopRegion(region);
        }}
      />
      <IconButton
        icon={LuTimer}
        label={click ? 'Metronome on' : 'Metronome'}
        disabled={!ready}
        className={btn(click)}
        onClick={() => {
          setClick(!click);
          engine?.setMetronome(!click);
        }}
      />
      <span
        data-testid="transport-clock"
        className="ml-2 font-mono text-xs tabular-nums text-foreground"
      >
        {clock(seconds)}
      </span>
      <span className="ml-3 text-xs text-muted-foreground">
        {Math.round(bpm)} BPM{sig ? ` · ${sig.numerator}/${sig.denominator}` : ''}
      </span>
    </div>
  );
}
