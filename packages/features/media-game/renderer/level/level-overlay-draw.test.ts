// vitest: the canvas overlay draw list (Phase 140 Themes E and F): E2 dashed connector, collider and trigger shapes.
import { describe, expect, it } from 'vitest';

import { drawExtras, drawGhosts, drawOverlayShapes, ghostInitial, hasExtras, NO_EXTRAS } from './level-overlay-draw';

function recorder() {
  const calls: Array<[string, ...unknown[]]> = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get: (t, key: string) => (key in t ? t[key] : (...args: unknown[]) => void calls.push([key, ...args])),
    set: (t, key: string, value) => {
      t[key] = value;
      calls.push([`set ${key}`, value]);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}
const view = { x: 0, y: 0, zoom: 1 };

describe('drawGhosts', () => {
  it('E2 draws a dashed connector from the authored position to the live one, then the ghost', () => {
    const { ctx, calls } = recorder();
    drawGhosts(ctx, {
      view,
      colour: '#123456',
      links: [{ id: 3, ref: { layerId: 1, objectId: 3 }, from: { x: 10, y: 10 }, to: { x: 50, y: 40 } }],
      ghosts: [{ ghost: { id: 3, type: 'enemy', x: 50, y: 40, alive: true }, at: { x: 50, y: 40 } }],
    });
    const dashOn = calls.findIndex((c) => c[0] === 'setLineDash' && Array.isArray(c[1]) && (c[1] as number[]).length > 0);
    const line = calls.findIndex((c) => c[0] === 'lineTo' && c[1] === 50 && c[2] === 40);
    expect(dashOn).toBeGreaterThanOrEqual(0);
    expect(line).toBeGreaterThan(dashOn);
    expect(calls.some((c) => c[0] === 'moveTo' && c[1] === 10 && c[2] === 10)).toBe(true);
    expect(calls.find((c) => c[0] === 'fillText')![1]).toBe('E');
  });
  it('takes the type initial', () => {
    expect(ghostInitial({ type: 'goblin' })).toBe('G');
    expect(ghostInitial({ type: '' })).toBe('?');
  });
});

describe('drawOverlayShapes', () => {
  it('fills at 30% with a 1 px stroke and dashes a one-way cell', () => {
    const { ctx, calls } = recorder();
    let cells = 0;
    drawOverlayShapes(ctx, {
      view,
      colour: '#f59e0b',
      cellPath: () => void (cells += 1),
      shapes: [
        { kind: 'cell', col: 0, row: 0, oneWay: false },
        { kind: 'cell', col: 1, row: 0, oneWay: true },
        { kind: 'rect', objectId: 1, type: 'prop', x: 0, y: 0, width: 10, height: 10, rotation: 0 },
      ],
    });
    expect(cells).toBe(2);
    expect(calls.filter((c) => c[0] === 'set globalAlpha').map((c) => c[1])).toContain(0.3);
    expect(calls.some((c) => c[0] === 'setLineDash' && (c[1] as number[]).length === 2)).toBe(true);
    expect(calls.filter((c) => c[0] === 'fill').length).toBe(3);
  });
  it('skips cells when nothing outlines them (a plan has no tile grid)', () => {
    const { ctx, calls } = recorder();
    drawOverlayShapes(ctx, { view, colour: '#fff', shapes: [{ kind: 'cell', col: 0, row: 0, oneWay: false }] });
    expect(calls.some((c) => c[0] === 'fill')).toBe(false);
  });
});

describe('extras', () => {
  it('hasExtras is false for nothing and drawExtras draws nothing then', () => {
    expect(hasExtras(NO_EXTRAS)).toBe(false);
    expect(hasExtras(undefined)).toBe(false);
    const { ctx, calls } = recorder();
    drawExtras(ctx, { extras: NO_EXTRAS, view });
    expect(calls.filter((c) => c[0] === 'fill' || c[0] === 'stroke')).toEqual([]);
  });
});
