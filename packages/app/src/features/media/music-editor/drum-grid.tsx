import { type Song } from '@midnite/studio-shared';
import { useMemo, useState } from 'react';
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';

import type { MusicEngine } from './engine/engine';
import {
  DEFAULT_STEP_VELOCITY,
  DRUM_STEP_OPTIONS,
  drumName,
  gridOf,
  readPattern,
  setGrid,
  toggleStep,
  type DrumSteps,
} from './model/drum-grid';
import { barTicks } from './model/song-edit';

type Props = {
  song: Song;
  trackId: string;
  onCommit: (next: Song, key?: string | null) => void;
  engine: MusicEngine | null;
};

/**
 * The drum grid (Phase 101 Theme G): a step sequencer over the track's ordinary notes, one bar at a
 * time. A click adds a step, a click on a lit step selects it, a click on the selected step removes
 * it; the velocity slider sets the selected step and the cell's brightness shows it. Swing is the
 * share of a step every odd step is delayed by, applied to the notes themselves.
 */
export function DrumGrid({ song, trackId, onCommit, engine }: Props) {
  const track = song.tracks.find((t) => t.id === trackId);
  const [barIndex, setBarIndex] = useState(0);
  const [selected, setSelected] = useState<{ pitch: number; step: number } | null>(null);
  const sig = song.timeSignatures[0] ?? { tick: 0, numerator: 4, denominator: 4 as const };
  const bar = barTicks(sig.numerator, sig.denominator);
  const cfg = track ? gridOf(track) : { steps: 16 as DrumSteps, swing: 0 };
  const pattern = useMemo(
    () => (track ? readPattern(track, barIndex, bar, cfg) : new Map<number, number[]>()),
    [track, barIndex, bar, cfg.steps, cfg.swing],
  );
  if (!track) return null;
  const lanes = [...pattern.keys()];
  const selectedVelocity = selected ? (pattern.get(selected.pitch)?.[selected.step] ?? 0) : 0;
  const ref = (pitch: number, step: number) => ({ barIndex, step, pitch });

  const press = (pitch: number, step: number) => {
    const velocity = pattern.get(pitch)?.[step] ?? 0;
    if (velocity === 0) {
      onCommit(toggleStep(song, trackId, ref(pitch, step), bar));
      setSelected({ pitch, step });
      void engine?.previewNote(trackId, pitch, DEFAULT_STEP_VELOCITY / 127);
    } else if (selected?.pitch === pitch && selected.step === step) {
      onCommit(toggleStep(song, trackId, ref(pitch, step), bar));
      setSelected(null);
    } else {
      setSelected({ pitch, step });
    }
  };

  return (
    <div data-testid="drum-grid" className="flex min-h-0 flex-1 flex-col text-xs">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-1">
        <label className="flex items-center gap-1 text-muted-foreground">
          Steps
          <select
            aria-label="Steps per bar"
            value={cfg.steps}
            onChange={(e) =>
              onCommit(setGrid(song, trackId, { steps: Number(e.target.value) as DrumSteps }, bar))
            }
            className="h-6 rounded border border-border bg-background px-1 text-foreground"
          >
            {DRUM_STEP_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-muted-foreground">
          Swing
          <input
            aria-label="Swing"
            type="range"
            min={0}
            max={100}
            value={Math.round(cfg.swing * 200)}
            onChange={(e) =>
              onCommit(
                setGrid(song, trackId, { swing: Number(e.target.value) / 200 }, bar),
                `swing:${trackId}`,
              )
            }
            className="w-28"
          />
          <span className="w-8 tabular-nums text-foreground">{Math.round(cfg.swing * 200)}%</span>
        </label>
        <label className="flex items-center gap-1 text-muted-foreground">
          Velocity
          <input
            aria-label="Step velocity"
            type="range"
            min={1}
            max={127}
            disabled={selectedVelocity === 0}
            value={selectedVelocity || DEFAULT_STEP_VELOCITY}
            onChange={(e) =>
              selected &&
              onCommit(
                toggleStep(
                  song,
                  trackId,
                  ref(selected.pitch, selected.step),
                  bar,
                  Number(e.target.value),
                ),
                `vel:${trackId}`,
              )
            }
            className="w-28"
          />
          <span className="w-8 tabular-nums text-foreground">{selectedVelocity || ''}</span>
        </label>
        <span className="ml-auto flex items-center gap-1 text-muted-foreground">
          <button
            type="button"
            aria-label="Previous bar"
            disabled={barIndex === 0}
            onClick={() => setBarIndex((b) => b - 1)}
            className="rounded p-0.5 hover:bg-accent disabled:opacity-40"
          >
            <LuChevronLeft className="h-3.5 w-3.5" aria-hidden />
          </button>
          <span data-testid="drum-bar" className="w-12 text-center tabular-nums text-foreground">
            Bar {barIndex + 1}
          </span>
          <button
            type="button"
            aria-label="Next bar"
            onClick={() => setBarIndex((b) => b + 1)}
            className="rounded p-0.5 hover:bg-accent"
          >
            <LuChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {lanes.map((pitch) => (
          <div key={pitch} className="flex items-center gap-2 py-px">
            <span className="w-20 shrink-0 truncate text-right text-muted-foreground">
              {drumName(pitch)}
            </span>
            <div
              className="grid flex-1 gap-0.5"
              style={{ gridTemplateColumns: `repeat(${cfg.steps}, minmax(0, 1fr))` }}
            >
              {pattern.get(pitch)!.map((velocity, step) => {
                const on = velocity > 0;
                const isSel = selected?.pitch === pitch && selected.step === step;
                return (
                  <button
                    key={step}
                    type="button"
                    data-testid={`step-${pitch}-${step}`}
                    aria-label={`${drumName(pitch)} step ${step + 1}`}
                    aria-pressed={on}
                    onClick={() => press(pitch, step)}
                    style={
                      on
                        ? { opacity: 0.35 + (velocity / 127) * 0.65, backgroundColor: track.color }
                        : undefined
                    }
                    className={`h-5 rounded-sm border ${isSel ? 'border-foreground' : 'border-border'} ${on ? '' : step % 4 === 0 ? 'bg-muted' : 'bg-muted/40'} hover:border-foreground`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
