import { songEndTick, type Song } from '@midnite/studio-shared';
import { useEffect, useRef } from 'react';
import { LuPlus } from 'react-icons/lu';

import type { MusicEngine } from './engine/engine';
import { arrangementSpan, rulerLines } from './model/ruler';
import { barTicks, removeTrack, setInstrument, setMixerFlag, updateTrack, addTrack } from './model/song-edit';
import { TRACK_ROW_H, TrackRow } from './track-row';
import { useElementSize } from './use-element-size';

export const RULER_H = 22;
export const HEADER_W = 232;

type Props = {
  song: Song;
  activeTrack: string | null;
  onActiveTrack: (id: string | null) => void;
  onCommit: (next: Song, key?: string | null) => void;
  engine: MusicEngine | null;
};

/**
 * The arrangement (Phase 101 Theme E): a header column per track — name, instrument, colour, mute,
 * solo — beside one timeline canvas with a bar/beat ruler, each track's notes as a thumbnail, and
 * the playhead. The timeline always fits the whole song; the piano roll is where you zoom.
 */
export function Arrangement({ song, activeTrack, onActiveTrack, onCommit, engine }: Props) {
  const [timelineRef, size] = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const sig = song.timeSignatures[0] ?? { tick: 0, numerator: 4, denominator: 4 as const };
  const bar = barTicks(sig.numerator, sig.denominator);
  const span = arrangementSpan(songEndTick(song), bar);
  const pxPerTick = size.width > 0 ? size.width / span : 0;
  const height = RULER_H + song.tracks.length * TRACK_ROW_H;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size.width, height);
    ctx.font = '10px ui-sans-serif, system-ui';
    ctx.textBaseline = 'middle';
    const fg = getComputedStyle(canvas).color;
    for (const line of rulerLines(song.timeSignatures, 0, span)) {
      const x = Math.round(line.tick * pxPerTick) + 0.5;
      ctx.fillStyle = line.bar !== null ? 'rgba(128,128,128,0.45)' : 'rgba(128,128,128,0.15)';
      ctx.fillRect(x, line.bar !== null ? 0 : RULER_H - 6, 1, line.bar !== null ? height : height - RULER_H + 6);
      if (line.bar !== null && pxPerTick * bar > 28) {
        ctx.fillStyle = fg;
        ctx.fillText(String(line.bar), x + 3, RULER_H / 2);
      }
    }
    ctx.fillStyle = 'rgba(128,128,128,0.4)';
    ctx.fillRect(0, RULER_H - 1, size.width, 1);
    song.tracks.forEach((t, row) => {
      const top = RULER_H + row * TRACK_ROW_H;
      ctx.fillStyle = t.id === activeTrack ? 'rgba(128,128,128,0.1)' : 'transparent';
      ctx.fillRect(0, top, size.width, TRACK_ROW_H);
      ctx.fillStyle = 'rgba(128,128,128,0.25)';
      ctx.fillRect(0, top + TRACK_ROW_H - 1, size.width, 1);
      if (t.notes.length === 0) return;
      let lo = 127;
      let hi = 0;
      for (const n of t.notes) {
        if (n.pitch < lo) lo = n.pitch;
        if (n.pitch > hi) hi = n.pitch;
      }
      const range = Math.max(12, hi - lo + 1);
      const rowH = Math.max(1.5, (TRACK_ROW_H - 10) / range);
      ctx.fillStyle = t.color;
      ctx.globalAlpha = t.mixer.mute ? 0.25 : 0.9;
      for (const n of t.notes) {
        const y = top + 5 + (hi - n.pitch) * rowH;
        ctx.fillRect(n.startTick * pxPerTick, y, Math.max(1, n.durationTicks * pxPerTick), rowH);
      }
      ctx.globalAlpha = 1;
    });
  }, [song, size, height, span, pxPerTick, bar, activeTrack]);

  useEffect(() => {
    const el = playheadRef.current;
    if (!el || !engine) return;
    let raf = 0;
    const place = () => {
      el.style.transform = `translateX(${engine.getPositionTicks() * pxPerTick}px)`;
      raf = engine.getState() === 'playing' ? requestAnimationFrame(place) : 0;
    };
    place();
    const unsubscribe = engine.subscribe(() => {
      if (!raf) place();
    });
    return () => {
      unsubscribe();
      cancelAnimationFrame(raf);
    };
  }, [engine, pxPerTick]);

  const seek = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (y <= RULER_H) engine?.seek(Math.max(0, Math.round(x / pxPerTick / (bar / sig.numerator)) * (bar / sig.numerator)));
    else {
      const row = Math.floor((y - RULER_H) / TRACK_ROW_H);
      const track = song.tracks[row];
      if (track) onActiveTrack(track.id);
    }
  };

  return (
    <div data-testid="arrangement" className="flex min-h-0 flex-col border-b border-border">
      <div className="flex min-h-0 flex-1 overflow-y-auto">
        <div style={{ width: HEADER_W }} className="shrink-0 border-r border-border">
          <div style={{ height: RULER_H }} className="flex items-center justify-between border-b border-border px-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            Tracks
            <button
              type="button"
              aria-label="Add track"
              onClick={() => {
                const next = addTrack(song);
                onCommit(next);
                onActiveTrack(next.tracks[next.tracks.length - 1]!.id);
              }}
              className="rounded p-0.5 hover:bg-accent hover:text-foreground"
            >
              <LuPlus className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          {song.tracks.map((t) => (
            <TrackRow
              key={t.id}
              track={t}
              active={t.id === activeTrack}
              onSelect={() => onActiveTrack(t.id)}
              onName={(name) => onCommit(updateTrack(song, t.id, { name }), `name:${t.id}`)}
              onColor={(color) => onCommit(updateTrack(song, t.id, { color }), `color:${t.id}`)}
              onInstrument={(choice) => onCommit(setInstrument(song, t.id, choice))}
              onMute={(on) => onCommit(setMixerFlag(song, t.id, 'mute', on))}
              onSolo={(on) => onCommit(setMixerFlag(song, t.id, 'solo', on))}
              onRemove={() => {
                onCommit(removeTrack(song, t.id));
                if (activeTrack === t.id) onActiveTrack(song.tracks.find((o) => o.id !== t.id)?.id ?? null);
              }}
            />
          ))}
          {song.tracks.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">No tracks yet. Add one to start.</p>}
        </div>
        <div ref={timelineRef} onPointerDown={seek} className="relative min-w-0 flex-1 text-foreground" style={{ height: Math.max(height, 1) }}>
          <canvas ref={canvasRef} data-testid="arrangement-canvas" style={{ width: size.width, height }} className="block" />
          <div ref={playheadRef} data-testid="arrangement-playhead" className="pointer-events-none absolute left-0 top-0 w-px bg-primary" style={{ height }} />
        </div>
      </div>
    </div>
  );
}
