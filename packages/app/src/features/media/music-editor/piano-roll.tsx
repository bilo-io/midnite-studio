import type { Song } from '@midnite/studio-shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { MusicEngine } from './engine/engine';
import {
  addNote, deleteNotes, duplicateNotes, floorTick, isBlackKey, moveNotes, pitchName, quantizeNotes,
  resizeNotes, setVelocities, allIndices,
} from './model/song-edit';
import {
  clampScrollY, DEFAULT_VIEW, drawLength, gestureDelta, hitTestNote, mergeSelection, notesInRect, pitchToY, tickToX,
  xToTick, yToPitch, zoomView, type Gesture, type Rect, type RollView,
} from './model/roll-math';
import { rulerLines } from './model/ruler';
import { editorKeyAction } from './model/keymap';
import { useElementSize } from './use-element-size';

export const GUTTER_W = 56;
export const VELOCITY_H = 64;

type Props = {
  song: Song;
  trackId: string | null;
  selection: ReadonlySet<number>;
  onSelection: (next: Set<number>) => void;
  /** One finished gesture or key action, as a single history step. */
  onCommit: (next: Song, key?: string | null) => void;
  /** Grid in ticks; 0 turns snap off. */
  grid: number;
  engine: MusicEngine | null;
  onTogglePlay: () => void;
  onUndo: () => void;
  onRedo: () => void;
};

/**
 * The piano roll (Phase 101 Theme E): one canvas for the keyboard gutter, grid and notes, so a
 * 10k-note track is a single paint rather than 10k elements, plus a velocity lane beneath. All
 * geometry and edits live in `model/`; this component only turns pointer and key events into them.
 * Pointer drag and the canvas pixels are covered by the Playwright spec, the rest by vitest.
 */
export function PianoRoll({ song, trackId, selection, onSelection, onCommit, grid, engine, onTogglePlay, onUndo, onRedo }: Props) {
  const [wrapRef, size] = useElementSize<HTMLDivElement>();
  const [view, setView] = useState<RollView>(DEFAULT_VIEW);
  const [draft, setDraft] = useState<Song | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const rollRef = useRef<HTMLCanvasElement>(null);
  const velRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ g: Gesture; base: Song } | null>(null);
  const marqueeStart = useRef<{ x: number; y: number; additive: boolean } | null>(null);
  const velDrag = useRef<{ base: Song; velocities: Map<number, number> } | null>(null);

  const shown = draft ?? song;
  const track = shown.tracks.find((t) => t.id === trackId) ?? null;
  const rollH = Math.max(0, size.height - VELOCITY_H);
  const rollW = Math.max(0, size.width - GUTTER_W);

  // Keep the scroll position legal as the viewport changes.
  const scrollY = clampScrollY(view.scrollY, view.rowH, rollH);

  const paint = useCallback(() => {
    const canvas = rollRef.current;
    if (!canvas || size.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = rollH * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const fg = getComputedStyle(canvas).color || '#888';
    const v = { ...view, scrollY };
    ctx.clearRect(0, 0, size.width, rollH);
    ctx.font = '10px ui-sans-serif, system-ui';
    ctx.textBaseline = 'middle';
    // Rows.
    const topPitch = yToPitch(v, 0);
    const bottomPitch = yToPitch(v, rollH);
    for (let p = topPitch; p >= bottomPitch; p--) {
      const y = pitchToY(v, p);
      ctx.fillStyle = isBlackKey(p) ? 'rgba(128,128,128,0.14)' : 'rgba(128,128,128,0.04)';
      ctx.fillRect(GUTTER_W, y, rollW, v.rowH);
      ctx.fillStyle = 'rgba(128,128,128,0.15)';
      ctx.fillRect(GUTTER_W, y + v.rowH - 1, rollW, 1);
    }
    // Beat and bar lines.
    const fromTick = Math.max(0, v.scrollTick);
    const toTick = xToTick(v, rollW);
    for (const line of rulerLines(shown.timeSignatures, fromTick, toTick)) {
      const x = GUTTER_W + tickToX(v, line.tick);
      ctx.fillStyle = line.bar !== null ? 'rgba(128,128,128,0.45)' : 'rgba(128,128,128,0.2)';
      ctx.fillRect(x, 0, 1, rollH);
    }
    // Other tracks as ghosts, the active track on top.
    ctx.save();
    ctx.beginPath();
    ctx.rect(GUTTER_W, 0, rollW, rollH);
    ctx.clip();
    for (const t of shown.tracks) {
      const active = t.id === trackId;
      ctx.fillStyle = t.color;
      ctx.globalAlpha = active ? 1 : 0.18;
      if (active) continue;
      for (const n of t.notes) {
        const x = GUTTER_W + tickToX(v, n.startTick);
        const w = n.durationTicks * v.pxPerTick;
        if (x + w < GUTTER_W || x > size.width) continue;
        ctx.fillRect(x, pitchToY(v, n.pitch) + 1, Math.max(1, w), v.rowH - 2);
      }
    }
    if (track) {
      track.notes.forEach((n, i) => {
        const x = GUTTER_W + tickToX(v, n.startTick);
        const w = Math.max(2, n.durationTicks * v.pxPerTick);
        if (x + w < GUTTER_W || x > size.width) return;
        const y = pitchToY(v, n.pitch);
        if (y + v.rowH < 0 || y > rollH) return;
        ctx.globalAlpha = 0.45 + 0.55 * (n.velocity / 127);
        ctx.fillStyle = track.color;
        ctx.fillRect(x, y + 1, w, v.rowH - 2);
        if (selection.has(i)) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = fg;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 0.5, y + 1.5, w - 1, v.rowH - 3);
        }
      });
    }
    ctx.globalAlpha = 1;
    if (marquee) {
      ctx.fillStyle = 'rgba(99,102,241,0.18)';
      ctx.strokeStyle = 'rgba(99,102,241,0.8)';
      ctx.lineWidth = 1;
      const x = GUTTER_W + Math.min(marquee.x1, marquee.x2);
      const y = Math.min(marquee.y1, marquee.y2);
      const w = Math.abs(marquee.x2 - marquee.x1);
      const h = Math.abs(marquee.y2 - marquee.y1);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    }
    ctx.restore();
    // Keyboard gutter.
    ctx.fillStyle = 'rgba(128,128,128,0.08)';
    ctx.fillRect(0, 0, GUTTER_W, rollH);
    for (let p = topPitch; p >= bottomPitch; p--) {
      const y = pitchToY(v, p);
      ctx.fillStyle = isBlackKey(p) ? '#222' : '#eee';
      ctx.fillRect(0, y, isBlackKey(p) ? GUTTER_W * 0.62 : GUTTER_W - 1, v.rowH - 1);
      if (p % 12 === 0) {
        ctx.fillStyle = '#444';
        ctx.fillText(pitchName(p), GUTTER_W - 24, y + v.rowH / 2);
      }
    }
  }, [view, scrollY, size, rollH, rollW, shown, track, trackId, selection, marquee]);

  useEffect(paint, [paint]);

  // Velocity lane.
  useEffect(() => {
    const canvas = velRef.current;
    if (!canvas || size.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = VELOCITY_H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size.width, VELOCITY_H);
    ctx.fillStyle = 'rgba(128,128,128,0.08)';
    ctx.fillRect(0, 0, GUTTER_W, VELOCITY_H);
    ctx.fillStyle = getComputedStyle(canvas).color;
    ctx.font = '10px ui-sans-serif, system-ui';
    ctx.fillText('Vel', 8, 12);
    if (!track) return;
    const v = { ...view, scrollY };
    track.notes.forEach((n, i) => {
      const x = GUTTER_W + tickToX(v, n.startTick);
      if (x < GUTTER_W - 3 || x > size.width) return;
      const h = Math.round((n.velocity / 127) * (VELOCITY_H - 6));
      ctx.fillStyle = track.color;
      ctx.globalAlpha = selection.has(i) ? 1 : 0.65;
      ctx.fillRect(x, VELOCITY_H - h, 3, h);
    });
    ctx.globalAlpha = 1;
  }, [view, scrollY, size, track, selection]);

  // Playhead overlay, moved straight on the element so playback never re-renders the tree.
  useEffect(() => {
    const el = playheadRef.current;
    if (!el || !engine) return;
    let raf = 0;
    const place = () => {
      const x = GUTTER_W + tickToX({ ...view, scrollY }, engine.getPositionTicks());
      el.style.transform = `translateX(${x}px)`;
      el.style.display = x < GUTTER_W || x > size.width ? 'none' : 'block';
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
  }, [engine, view, scrollY, size.width]);

  // Wheel: scroll, shift-scroll sideways, ctrl/cmd zoom time, alt zoom pitch rows. Needs a non-passive listener.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const anchor = { x: e.clientX - rect.left - GUTTER_W, y: e.clientY - rect.top };
      setView((cur) => {
        if (e.ctrlKey || e.metaKey) return zoomView(cur, 'x', Math.exp(-e.deltaY * 0.01), anchor);
        if (e.altKey) return zoomView(cur, 'y', Math.exp(-e.deltaY * 0.01), anchor);
        if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          const dx = e.shiftKey ? e.deltaY : e.deltaX;
          return { ...cur, scrollTick: Math.max(0, cur.scrollTick + dx / cur.pxPerTick) };
        }
        return { ...cur, scrollY: clampScrollY(cur.scrollY + e.deltaY, cur.rowH, rollH) };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [wrapRef, rollH]);

  const localPoint = (e: React.PointerEvent) => {
    const rect = rollRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const v = useMemo(() => ({ ...view, scrollY }), [view, scrollY]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!track || !trackId || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = localPoint(e);
    if (x < GUTTER_W) {
      void engine?.previewNote(trackId, yToPitch(v, y));
      return;
    }
    const rx = x - GUTTER_W;
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const hit = hitTestNote(track.notes, v, rx, y);
    if (hit) {
      let indices = [...selection];
      if (!selection.has(hit.index)) {
        const next = mergeSelection(selection, [hit.index], additive);
        onSelection(next);
        indices = [...next];
      } else if (additive) {
        const next = mergeSelection(selection, [hit.index], true);
        onSelection(next);
        return;
      }
      const note = track.notes[hit.index]!;
      void engine?.previewNote(trackId, note.pitch, note.velocity / 127);
      gesture.current = {
        base: song,
        g:
          hit.zone === 'resize'
            ? { kind: 'resize', indices, originTick: xToTick(v, rx) }
            : { kind: 'move', indices, originTick: xToTick(v, rx), originPitch: yToPitch(v, y) },
      };
      return;
    }
    if (additive) {
      marqueeStart.current = { x: rx, y, additive: true };
      setMarquee({ x1: rx, y1: y, x2: rx, y2: y });
      return;
    }
    // A click on empty grid draws a note; dragging right lengthens it.
    const startTick = floorTick(xToTick(v, rx), grid);
    const pitch = yToPitch(v, y);
    const added = addNote(song, trackId, {
      pitch,
      startTick,
      durationTicks: grid > 0 ? grid : 120,
      velocity: 96,
    });
    if (!added) return;
    onSelection(new Set([added.index]));
    setDraft(added.song);
    void engine?.previewNote(trackId, pitch);
    gesture.current = { base: added.song, g: { kind: 'draw', index: added.index, startTick } };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = localPoint(e);
    const rx = x - GUTTER_W;
    if (marqueeStart.current) {
      setMarquee({ x1: marqueeStart.current.x, y1: marqueeStart.current.y, x2: rx, y2: y });
      return;
    }
    const cur = gesture.current;
    if (!cur || !trackId) return;
    const tick = xToTick(v, rx);
    const pitch = yToPitch(v, y);
    const { g, base } = cur;
    if (g.kind === 'draw') {
      const note = base.tracks.find((t) => t.id === trackId)!.notes[g.index]!;
      const length = drawLength(g.startTick, tick, grid);
      setDraft(resizeNotes(base, trackId, [g.index], length - note.durationTicks));
      return;
    }
    const { dTick, dPitch } = gestureDelta(g, tick, pitch, grid);
    setDraft(
      g.kind === 'move'
        ? moveNotes(base, trackId, g.indices, dTick, dPitch)
        : resizeNotes(base, trackId, g.indices, dTick),
    );
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (marqueeStart.current && track) {
      const { x, y } = localPoint(e);
      const rect = { x1: marqueeStart.current.x, y1: marqueeStart.current.y, x2: x - GUTTER_W, y2: y };
      onSelection(mergeSelection(selection, notesInRect(track.notes, v, rect), marqueeStart.current.additive));
      marqueeStart.current = null;
      setMarquee(null);
      return;
    }
    if (gesture.current && draft) onCommit(draft);
    gesture.current = null;
    setDraft(null);
  };

  // Velocity lane painting: drag across note stems, one history step on release.
  const velPoint = (e: React.PointerEvent) => {
    const rect = velRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left - GUTTER_W, y: e.clientY - rect.top };
  };
  const paintVelocity = (e: React.PointerEvent) => {
    if (!track || !trackId || !velDrag.current) return;
    const { x, y } = velPoint(e);
    const tick = xToTick(v, x);
    let best = -1;
    let bestDist = Infinity;
    track.notes.forEach((n, i) => {
      const d = Math.abs(n.startTick - tick) * v.pxPerTick;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    if (best < 0 || bestDist > 6) return;
    const velocity = Math.max(1, Math.min(127, Math.round(((VELOCITY_H - y) / (VELOCITY_H - 6)) * 127)));
    const targets = selection.has(best) ? [...selection] : [best];
    for (const i of targets) velDrag.current.velocities.set(i, velocity);
    setDraft(setVelocities(velDrag.current.base, trackId, velDrag.current.velocities));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const action = editorKeyAction(e);
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    if (action.type === 'play-pause') return onTogglePlay();
    if (action.type === 'undo') return onUndo();
    if (action.type === 'redo') return onRedo();
    if (!trackId) return;
    if (action.type === 'select-all') return onSelection(new Set(allIndices(song, trackId)));
    const picked = [...selection];
    if (picked.length === 0 && action.type !== 'quantize') return;
    switch (action.type) {
      case 'delete':
        onCommit(deleteNotes(song, trackId, picked));
        onSelection(new Set());
        return;
      case 'duplicate': {
        const r = duplicateNotes(song, trackId, picked, grid);
        if (r) {
          onCommit(r.song);
          onSelection(new Set(r.indices));
        }
        return;
      }
      case 'quantize':
        onCommit(quantizeNotes(song, trackId, picked.length ? picked : 'all', grid || 120));
        return;
      case 'nudge': {
        const step = grid > 0 ? grid : 120;
        const dTick = action.dx * (action.coarse ? step * 4 : step);
        const dPitch = action.dy * (action.coarse ? 12 : 1);
        onCommit(moveNotes(song, trackId, picked, dTick, dPitch), 'nudge');
        return;
      }
    }
  };

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-testid="piano-roll"
      aria-label="Piano roll"
      className="relative min-h-0 flex-1 text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <canvas
        ref={rollRef}
        data-testid="piano-roll-canvas"
        style={{ width: size.width, height: rollH }}
        className="block touch-none"
        onPointerDown={(e) => {
          wrapRef.current?.focus();
          onPointerDown(e);
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <canvas
        ref={velRef}
        data-testid="velocity-lane"
        style={{ width: size.width, height: VELOCITY_H }}
        className="block touch-none border-t border-border"
        onPointerDown={(e) => {
          if (!track) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          velDrag.current = { base: song, velocities: new Map() };
          paintVelocity(e);
        }}
        onPointerMove={paintVelocity}
        onPointerUp={() => {
          if (velDrag.current && draft) onCommit(draft);
          velDrag.current = null;
          setDraft(null);
        }}
      />
      <div
        ref={playheadRef}
        data-testid="piano-roll-playhead"
        className="pointer-events-none absolute left-0 top-0 w-px bg-primary"
        style={{ height: rollH, display: 'none' }}
      />
      <span className="pointer-events-none absolute right-2 top-1 text-[10px] text-muted-foreground">
        click draws · shift-drag selects · ⌘/ctrl-wheel zooms
      </span>
    </div>
  );
}
