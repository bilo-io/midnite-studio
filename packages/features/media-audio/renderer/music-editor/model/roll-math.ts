import type { SongNote } from '@midnite/studio-shared';

import { clamp, MAX_PITCH, MIN_PITCH } from './song-edit';

/**
 * Geometry and gestures for the piano roll (Phase 101 Theme E), all pure so the canvas component
 * stays a thin shell over them. A view maps ticks to x and pitches to y; the top row is pitch 127.
 */
export type RollView = {
  /** Horizontal zoom, pixels per tick. */
  pxPerTick: number;
  /** Row height in pixels. */
  rowH: number;
  /** Tick at the left edge. */
  scrollTick: number;
  /** Pixels scrolled down from the top of pitch 127. */
  scrollY: number;
};

export const DEFAULT_VIEW: RollView = { pxPerTick: 0.1, rowH: 14, scrollTick: 0, scrollY: 14 * 48 };
export const MIN_PX_PER_TICK = 0.005;
export const MAX_PX_PER_TICK = 1.5;
export const MIN_ROW_H = 6;
export const MAX_ROW_H = 32;
/** Pixels at a note's right edge that grab its length instead of moving it. */
export const RESIZE_HANDLE_PX = 6;

export const tickToX = (view: RollView, tick: number): number => (tick - view.scrollTick) * view.pxPerTick;
export const xToTick = (view: RollView, x: number): number => x / view.pxPerTick + view.scrollTick;
export const pitchToY = (view: RollView, pitch: number): number => (MAX_PITCH - pitch) * view.rowH - view.scrollY;
export const yToPitch = (view: RollView, y: number): number =>
  clamp(MAX_PITCH - Math.floor((y + view.scrollY) / view.rowH), MIN_PITCH, MAX_PITCH);

export function zoomView(view: RollView, axis: 'x' | 'y', factor: number, anchor: { x: number; y: number }): RollView {
  if (axis === 'x') {
    const pxPerTick = clamp(view.pxPerTick * factor, MIN_PX_PER_TICK, MAX_PX_PER_TICK);
    const tickAtAnchor = xToTick(view, anchor.x);
    return { ...view, pxPerTick, scrollTick: Math.max(0, tickAtAnchor - anchor.x / pxPerTick) };
  }
  const rowH = clamp(view.rowH * factor, MIN_ROW_H, MAX_ROW_H);
  const pitchPos = (anchor.y + view.scrollY) / view.rowH;
  return { ...view, rowH, scrollY: clampScrollY(pitchPos * rowH - anchor.y, rowH, Infinity) };
}

/** Keep the pitch range on screen: 0 ≤ scrollY ≤ (128 rows − viewport). */
export function clampScrollY(scrollY: number, rowH: number, viewportH: number): number {
  const max = Math.max(0, (MAX_PITCH + 1) * rowH - (Number.isFinite(viewportH) ? viewportH : 0));
  return clamp(scrollY, 0, max);
}

export type NoteHit = { index: number; zone: 'body' | 'resize' };

/** The topmost note under (x, y), preferring later notes (drawn last). Linear: used on pointer events only. */
export function hitTestNote(notes: readonly SongNote[], view: RollView, x: number, y: number): NoteHit | null {
  const pitch = yToPitch(view, y);
  const tick = xToTick(view, x);
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i]!;
    if (n.pitch !== pitch || tick < n.startTick || tick > n.startTick + n.durationTicks) continue;
    const rightEdge = tickToX(view, n.startTick + n.durationTicks);
    const handle = Math.min(RESIZE_HANDLE_PX, (n.durationTicks * view.pxPerTick) / 2);
    return { index: i, zone: x >= rightEdge - handle ? 'resize' : 'body' };
  }
  return null;
}

export type Rect = { x1: number; y1: number; x2: number; y2: number };

/** Indices of notes whose box touches a pixel rectangle. */
export function notesInRect(notes: readonly SongNote[], view: RollView, rect: Rect): number[] {
  const x1 = Math.min(rect.x1, rect.x2);
  const x2 = Math.max(rect.x1, rect.x2);
  const y1 = Math.min(rect.y1, rect.y2);
  const y2 = Math.max(rect.y1, rect.y2);
  const out: number[] = [];
  notes.forEach((n, i) => {
    const nx1 = tickToX(view, n.startTick);
    const nx2 = tickToX(view, n.startTick + n.durationTicks);
    const ny1 = pitchToY(view, n.pitch);
    const ny2 = ny1 + view.rowH;
    if (nx2 >= x1 && nx1 <= x2 && ny2 >= y1 && ny1 <= y2) out.push(i);
  });
  return out;
}

/** Combine a marquee/click result with the current selection: shift toggles, otherwise replaces. */
export function mergeSelection(current: ReadonlySet<number>, picked: readonly number[], additive: boolean): Set<number> {
  if (!additive) return new Set(picked);
  const next = new Set(current);
  for (const i of picked) {
    if (next.has(i)) next.delete(i);
    else next.add(i);
  }
  return next;
}

// --- gestures -------------------------------------------------------------------

export type Gesture =
  | { kind: 'move'; indices: number[]; originTick: number; originPitch: number }
  | { kind: 'resize'; indices: number[]; originTick: number }
  | { kind: 'draw'; index: number; startTick: number };

/** The delta a gesture has travelled, in snapped ticks and semitones. */
export function gestureDelta(
  gesture: Gesture,
  tick: number,
  pitch: number,
  grid: number,
): { dTick: number; dPitch: number } {
  const snap = (v: number) => (grid > 0 ? Math.round(v / grid) * grid : Math.round(v));
  if (gesture.kind === 'move') {
    return { dTick: snap(tick - gesture.originTick), dPitch: pitch - gesture.originPitch };
  }
  if (gesture.kind === 'resize') return { dTick: snap(tick - gesture.originTick), dPitch: 0 };
  return { dTick: 0, dPitch: 0 };
}

/** Length of a note being drawn, from its start to the pointer, snapped, never under one grid cell. */
export function drawLength(startTick: number, tick: number, grid: number): number {
  const min = grid > 0 ? grid : 1;
  const span = tick - startTick;
  return Math.max(min, grid > 0 ? Math.round(span / grid) * grid : Math.round(span));
}
