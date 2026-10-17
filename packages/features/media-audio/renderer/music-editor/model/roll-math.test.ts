import { describe, expect, it } from 'vitest';

import { editorKeyAction } from './keymap';
import {
  DEFAULT_VIEW, drawLength, gestureDelta, hitTestNote, mergeSelection, notesInRect, pitchToY, tickToX, xToTick,
  yToPitch, zoomView, clampScrollY, type Gesture, type RollView,
} from './roll-math';

const view: RollView = { pxPerTick: 0.1, rowH: 10, scrollTick: 0, scrollY: 0 };
const notes = [
  { pitch: 127, startTick: 0, durationTicks: 480, velocity: 80 },
  { pitch: 126, startTick: 100, durationTicks: 100, velocity: 80 },
];

describe('view maths', () => {
  it('round-trips ticks and pitches', () => {
    expect(xToTick(view, tickToX(view, 960))).toBe(960);
    expect(yToPitch(view, pitchToY(view, 60) + 3)).toBe(60);
    expect(pitchToY(view, 127)).toBe(0);
  });
  it('zooms around the anchor and clamps', () => {
    const z = zoomView({ ...view, scrollTick: 1000 }, 'x', 2, { x: 50, y: 0 });
    expect(xToTick(z, 50)).toBeCloseTo(xToTick({ ...view, scrollTick: 1000 }, 50));
    expect(zoomView(view, 'x', 1e9, { x: 0, y: 0 }).pxPerTick).toBeLessThanOrEqual(1.5);
    expect(zoomView(view, 'y', 0.0001, { x: 0, y: 0 }).rowH).toBeGreaterThanOrEqual(6);
    expect(DEFAULT_VIEW.scrollY).toBeGreaterThan(0);
  });
  it('keeps the pitch range on screen', () => {
    expect(clampScrollY(-5, 10, 200)).toBe(0);
    expect(clampScrollY(99999, 10, 200)).toBe(128 * 10 - 200);
  });
});

describe('hit testing', () => {
  it('finds the body and the resize edge', () => {
    expect(hitTestNote(notes, view, 20, 5)).toEqual({ index: 0, zone: 'body' });
    expect(hitTestNote(notes, view, 47, 5)).toEqual({ index: 0, zone: 'resize' });
    expect(hitTestNote(notes, view, 11, 15)).toEqual({ index: 1, zone: 'body' });
    expect(hitTestNote(notes, view, 300, 5)).toBeNull();
  });
  it('selects by marquee and merges additively', () => {
    expect(notesInRect(notes, view, { x1: 0, y1: 0, x2: 5, y2: 5 })).toEqual([0]);
    expect(notesInRect(notes, view, { x1: 500, y1: 0, x2: 0, y2: 30 })).toEqual([0, 1]);
    expect([...mergeSelection(new Set([0, 1]), [1, 2], true)].sort()).toEqual([0, 2]);
    expect([...mergeSelection(new Set([0]), [3], false)]).toEqual([3]);
  });
});

describe('gestures', () => {
  it('snaps move and resize deltas', () => {
    const move: Gesture = { kind: 'move', indices: [0], originTick: 100, originPitch: 60 };
    expect(gestureDelta(move, 290, 62, 120)).toEqual({ dTick: 240, dPitch: 2 });
    expect(gestureDelta({ kind: 'resize', indices: [0], originTick: 0 }, 59, 0, 120)).toEqual({ dTick: 0, dPitch: 0 });
  });
  it('draws at least one cell', () => {
    expect(drawLength(0, 10, 120)).toBe(120);
    expect(drawLength(0, 370, 120)).toBe(360);
  });
});

describe('keymap', () => {
  const k = (key: string, o: Partial<Record<'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey', boolean>> = {}) =>
    editorKeyAction({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...o });
  it('maps the documented shortcuts', () => {
    expect(k(' ')).toEqual({ type: 'play-pause' });
    expect(k('Delete')).toEqual({ type: 'delete' });
    expect(k('d', { metaKey: true })).toEqual({ type: 'duplicate' });
    expect(k('A', { ctrlKey: true })).toEqual({ type: 'select-all' });
    expect(k('q')).toEqual({ type: 'quantize' });
    expect(k('ArrowRight', { shiftKey: true })).toEqual({ type: 'nudge', dx: 1, dy: 0, coarse: true });
    expect(k('ArrowDown')).toEqual({ type: 'nudge', dx: 0, dy: -1, coarse: false });
    expect(k('z', { metaKey: true })).toEqual({ type: 'undo' });
    expect(k('z', { metaKey: true, shiftKey: true })).toEqual({ type: 'redo' });
  });
  it('ignores everything else', () => {
    expect(k('x')).toBeNull();
    expect(k('d', { metaKey: true, altKey: true })).toBeNull();
  });
});
