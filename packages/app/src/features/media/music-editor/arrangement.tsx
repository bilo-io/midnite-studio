import {
  clipEndTick,
  expandClips,
  expandTrackNotes,
  songEndTick,
  type Song,
} from '@midnite/studio-shared';
import { useEffect, useRef, useState } from 'react';
import { LuCopy, LuLink, LuPlus, LuRepeat, LuScissors, LuTrash2 } from 'react-icons/lu';

import {
  clipAt,
  createClipFromNotes,
  deleteClip,
  duplicateClip,
  findClip,
  joinCandidate,
  joinClips,
  moveClip,
  resizeClip,
  setClipLoop,
  splitClip,
} from './model/clip-edit';
import type { MusicEngine } from './engine/engine';
import { arrangementSpan, rulerLines } from './model/ruler';
import {
  barTicks,
  removeTrack,
  setInstrument,
  setMixerFlag,
  updateTrack,
  addTrack,
} from './model/song-edit';
import { TRACK_ROW_H, TrackRow } from './track-row';
import { useElementSize } from './use-element-size';

export const RULER_H = 22;
export const HEADER_W = 232;
/** Pixels at a clip's right edge that resize it instead of moving it. */
const CLIP_EDGE_PX = 6;

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
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const drag = useRef<{
    id: string;
    mode: 'move' | 'resize';
    grabTick: number;
    origin: number;
  } | null>(null);
  const beat = bar / sig.numerator;
  const span = arrangementSpan(
    Math.max(songEndTick(expandClips(song)), ...song.clips.map(clipEndTick)),
    bar,
  );
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
      ctx.fillRect(
        x,
        line.bar !== null ? 0 : RULER_H - 6,
        1,
        line.bar !== null ? height : height - RULER_H + 6,
      );
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
      const notes = expandTrackNotes(t, song.clips);
      for (const clip of song.clips) {
        if (clip.trackId !== t.id) continue;
        const x = clip.startTick * pxPerTick;
        const w = Math.max(2, clip.lengthTicks * pxPerTick);
        ctx.globalAlpha = 1;
        ctx.fillStyle = t.color + '33';
        ctx.fillRect(x, top + 2, w, TRACK_ROW_H - 5);
        ctx.strokeStyle = clip.id === selectedClip ? fg : t.color;
        ctx.lineWidth = clip.id === selectedClip ? 2 : 1;
        ctx.strokeRect(x + 0.5, top + 2.5, w - 1, TRACK_ROW_H - 6);
        if (clip.loop) {
          ctx.fillStyle = t.color;
          ctx.fillText('↻', x + w - 12, top + 10);
        }
      }
      if (notes.length === 0) return;
      let lo = 127;
      let hi = 0;
      for (const n of notes) {
        if (n.pitch < lo) lo = n.pitch;
        if (n.pitch > hi) hi = n.pitch;
      }
      const range = Math.max(12, hi - lo + 1);
      const rowH = Math.max(1.5, (TRACK_ROW_H - 10) / range);
      ctx.fillStyle = t.color;
      ctx.globalAlpha = t.mixer.mute ? 0.25 : 0.9;
      for (const n of notes) {
        const y = top + 5 + (hi - n.pitch) * rowH;
        ctx.fillRect(n.startTick * pxPerTick, y, Math.max(1, n.durationTicks * pxPerTick), rowH);
      }
      ctx.globalAlpha = 1;
    });
  }, [song, size, height, span, pxPerTick, bar, activeTrack, selectedClip]);

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
    if (y <= RULER_H)
      engine?.seek(
        Math.max(0, Math.round(x / pxPerTick / (bar / sig.numerator)) * (bar / sig.numerator)),
      );
    else {
      const row = Math.floor((y - RULER_H) / TRACK_ROW_H);
      const track = song.tracks[row];
      if (!track) return;
      onActiveTrack(track.id);
      const tick = x / pxPerTick;
      const clip = clipAt(song, track.id, tick);
      setSelectedClip(clip?.id ?? null);
      if (!clip) return;
      const nearEdge = clipEndTick(clip) * pxPerTick - x <= CLIP_EDGE_PX;
      drag.current = {
        id: clip.id,
        mode: nearEdge ? 'resize' : 'move',
        grabTick: tick - clip.startTick,
        origin: clip.startTick,
      };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
  };

  const dragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || pxPerTick === 0) return;
    const tick = (e.clientX - e.currentTarget.getBoundingClientRect().left) / pxPerTick;
    const snap = (t: number) => Math.max(0, Math.round(t / beat) * beat);
    const clip = findClip(song, d.id);
    if (!clip) return;
    onCommit(
      d.mode === 'move'
        ? moveClip(song, d.id, snap(tick - d.grabTick))
        : resizeClip(song, d.id, Math.max(beat, snap(tick) - clip.startTick)),
      `clip:${d.id}`,
    );
  };

  const selected = findClip(song, selectedClip);
  const playhead = () => engine?.getPositionTicks() ?? 0;
  const act = (result: { song: Song; id: string } | null) => {
    if (!result) return;
    onCommit(result.song);
    setSelectedClip(result.id);
  };

  return (
    <div data-testid="arrangement" className="flex min-h-0 flex-col border-b border-border">
      <div className="flex min-h-0 flex-1 overflow-y-auto">
        <div style={{ width: HEADER_W }} className="shrink-0 border-r border-border">
          <div
            style={{ height: RULER_H }}
            className="flex items-center justify-between border-b border-border px-2 text-[10px] uppercase tracking-wide text-muted-foreground"
          >
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
                if (activeTrack === t.id)
                  onActiveTrack(song.tracks.find((o) => o.id !== t.id)?.id ?? null);
              }}
            />
          ))}
          {song.tracks.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              No tracks yet. Add one to start.
            </p>
          )}
        </div>
        <div
          ref={timelineRef}
          onPointerDown={seek}
          onPointerMove={dragMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          className="relative min-w-0 flex-1 text-foreground"
          style={{ height: Math.max(height, 1) }}
        >
          <canvas
            ref={canvasRef}
            data-testid="arrangement-canvas"
            style={{ width: size.width, height }}
            className="block"
          />
          <div
            ref={playheadRef}
            data-testid="arrangement-playhead"
            className="pointer-events-none absolute left-0 top-0 w-px bg-primary"
            style={{ height }}
          />
        </div>
      </div>
      <div
        data-testid="clip-bar"
        className="flex flex-wrap items-center gap-1 border-t border-border px-2 py-1 text-[11px]"
      >
        <button
          type="button"
          aria-label="New clip from notes"
          disabled={!activeTrack}
          onClick={() => activeTrack && act(createClipFromNotes(song, activeTrack, bar))}
          className={BTN}
        >
          <LuPlus className="h-3 w-3" aria-hidden /> Clip
        </button>
        {selected ? (
          <>
            <span
              className="max-w-[140px] truncate px-1 text-muted-foreground"
              data-testid="clip-name"
            >
              {selected.name || selected.id}
            </span>
            <button
              type="button"
              aria-label="Loop clip"
              aria-pressed={selected.loop}
              onClick={() => onCommit(setClipLoop(song, selected.id, !selected.loop))}
              className={`${BTN} ${selected.loop ? 'bg-accent text-foreground' : ''}`}
            >
              <LuRepeat className="h-3 w-3" aria-hidden /> Loop
            </button>
            <button
              type="button"
              aria-label="Split clip at playhead"
              onClick={() => act(splitClip(song, selected.id, playhead()))}
              className={BTN}
            >
              <LuScissors className="h-3 w-3" aria-hidden /> Split
            </button>
            <button
              type="button"
              aria-label="Join with next clip"
              disabled={!joinCandidate(song, selected.id)}
              onClick={() => onCommit(joinClips(song, selected.id))}
              className={BTN}
            >
              <LuLink className="h-3 w-3" aria-hidden /> Join
            </button>
            <button
              type="button"
              aria-label="Duplicate clip"
              onClick={() => act(duplicateClip(song, selected.id))}
              className={BTN}
            >
              <LuCopy className="h-3 w-3" aria-hidden /> Duplicate
            </button>
            <button
              type="button"
              aria-label="Delete clip"
              onClick={() => {
                onCommit(deleteClip(song, selected.id));
                setSelectedClip(null);
              }}
              className={BTN}
            >
              <LuTrash2 className="h-3 w-3" aria-hidden /> Delete
            </button>
          </>
        ) : (
          <span className="text-muted-foreground">
            Select a clip to loop, split, join or duplicate it.
          </span>
        )}
      </div>
    </div>
  );
}

const BTN =
  'inline-flex h-6 items-center gap-1 rounded px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40';
