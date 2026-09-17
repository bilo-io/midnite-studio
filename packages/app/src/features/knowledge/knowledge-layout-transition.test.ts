// Layer: vitest — pure math and bookkeeping with an injected clock, no rAF (see knowledge-layout-transition.ts).
import { describe, expect, it } from 'vitest';

import { LayoutTransition } from './knowledge-layout-transition';

describe('LayoutTransition', () => {
  it('is empty and idle until something starts', () => {
    const transition = new LayoutTransition();
    const sample = transition.sample(0);
    expect(sample.positions.size).toBe(0);
    expect(sample.animating).toBe(false);
  });

  it('starts every node at `from` and lands exactly at `to`', () => {
    const transition = new LayoutTransition();
    transition.start(new Map([['a', { x: 0, y: 0 }]]), { a: { x: 100, y: 200 } }, 0, 300);

    const start = transition.sample(0);
    expect(start.positions.get('a')).toEqual({ x: 0, y: 0 });
    expect(start.animating).toBe(true);

    const end = transition.sample(300);
    expect(end.positions.get('a')).toEqual({ x: 100, y: 200 });
    expect(end.animating).toBe(false);
  });

  it('interpolates monotonically between from and to along each axis', () => {
    const transition = new LayoutTransition();
    transition.start(new Map([['a', { x: 0, y: 0 }]]), { a: { x: 100, y: 0 } }, 0, 100);

    const early = transition.sample(20).positions.get('a')!;
    const mid = transition.sample(50).positions.get('a')!;
    const late = transition.sample(80).positions.get('a')!;
    expect(early.x).toBeLessThan(mid.x);
    expect(mid.x).toBeLessThan(late.x);
  });

  it('a node with no `from` entry does not move (starts at its own target)', () => {
    const transition = new LayoutTransition();
    transition.start(new Map(), { a: { x: 5, y: 5 } }, 0, 100);
    expect(transition.sample(50).positions.get('a')).toEqual({ x: 5, y: 5 });
  });

  it('stops reporting `animating` once it has landed, and stays stopped', () => {
    const transition = new LayoutTransition();
    transition.start(new Map([['a', { x: 0, y: 0 }]]), { a: { x: 1, y: 1 } }, 0, 100);
    expect(transition.sample(100).animating).toBe(false);
    expect(transition.sample(200).animating).toBe(false);
  });

  it('a zero-duration start settles immediately — the "snap, don\'t animate" case (Phase 84)', () => {
    const transition = new LayoutTransition();
    transition.start(new Map([['a', { x: 0, y: 0 }]]), { a: { x: 9, y: 9 } }, 0, 0);
    expect(transition.sample(0).animating).toBe(false);
  });

  it('every node tweens together — no stagger', () => {
    const transition = new LayoutTransition();
    transition.start(
      new Map([
        ['a', { x: 0, y: 0 }],
        ['b', { x: 0, y: 0 }],
      ]),
      { a: { x: 10, y: 0 }, b: { x: 10, y: 0 } },
      0,
      100,
    );
    const mid = transition.sample(50);
    expect(mid.positions.get('a')).toEqual(mid.positions.get('b'));
  });

  it('clear() drops the in-flight tween', () => {
    const transition = new LayoutTransition();
    transition.start(new Map([['a', { x: 0, y: 0 }]]), { a: { x: 1, y: 1 } }, 0, 100);
    transition.clear();
    expect(transition.animating).toBe(false);
    expect(transition.sample(50).positions.size).toBe(0);
  });
});
