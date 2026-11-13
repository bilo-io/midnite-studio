// Layer: vitest — the shared lifecycle with an injected clock and frame scheduler, no browser.
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { KnowledgeGraphPayload } from '@midnite/studio-shared';

import { defaultFilterState } from '../knowledge-filters';
import { INTRO_TIMING } from '../knowledge-intro';
import { Base2DRenderer, ClickGate, type Engine2DEnv } from './base-2d-renderer';
import type { Node2D } from './knowledge-2d-model';

const payload = {
  nodes: [
    { id: 'a', label: 'A', community: 0, communityName: 'one', fileType: 'code' },
    { id: 'b', label: 'B', community: 1, communityName: 'two', fileType: 'code' },
  ],
  links: [{ source: 'a', target: 'b', relation: 'calls', weight: 1, confidence: 1 }],
  positions: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
  builtAtCommit: 'x',
  cached: false,
  commitsBehind: null,
} as unknown as KnowledgeGraphPayload;

class Probe extends Base2DRenderer {
  draws: Array<Record<string, number>> = [];
  mounted = 0;
  unmounted = 0;
  modelCalls = 0;
  flown: Array<[string, boolean]> = [];
  protected mountEngine() { this.mounted++; }
  protected unmountEngine() { this.unmounted++; }
  protected modelChanged() { this.modelCalls++; }
  protected draw() {
    this.draws.push(Object.fromEntries([...this.positions].map(([id, p]) => [id, p.x])));
  }
  protected flyTo(node: Node2D, animate: boolean) { this.flown.push([node.id, animate]); }
  get edge() { return this.edgeScale; }
}

function setup(reduced = false) {
  let clock = 0;
  const frames: Array<() => void> = [];
  const env: Engine2DEnv = {
    prefersReducedMotion: () => reduced,
    colorFor: () => 'rgb(1, 2, 3)',
    now: () => clock,
    requestFrame: (cb) => frames.push(cb),
    cancelFrame: () => frames.splice(0, frames.length),
  };
  const probe = new Probe(env);
  const container = {} as HTMLDivElement;
  const mount = () =>
    probe.mount(container, payload, { onNodeClick: () => {}, onNodeDoubleClick: () => {} }, { maxNodes: Infinity });
  const advance = (ms: number) => {
    clock += ms;
    const run = frames.splice(0, frames.length);
    run.forEach((f) => f());
  };
  return { probe, mount, advance, frames };
}

describe('Base2DRenderer', () => {
  it('bursts from the centroid and lands on the laid-out positions', () => {
    const { probe, mount, advance, frames } = setup();
    mount();
    expect(probe.draws.at(-1)).toEqual({ a: 50, b: 50 });
    expect(probe.edge).toBe(0);
    advance(INTRO_TIMING.nodeDurationMs + INTRO_TIMING.staggerMs + 10);
    expect(probe.draws.at(-1)).toEqual({ a: 0, b: 100 });
    expect(probe.edge).toBe(1);
    expect(frames).toHaveLength(0);
  });

  it('skips the intro entirely under reduced motion', () => {
    const { probe, mount, frames } = setup(true);
    mount();
    expect(probe.draws.at(-1)).toEqual({ a: 0, b: 100 });
    expect(frames).toHaveLength(0);
  });

  it('snaps an in-flight intro when paused, and never starts one while paused', () => {
    const { probe, mount, advance, frames } = setup();
    mount();
    probe.setPaused(true);
    expect(probe.draws.at(-1)).toEqual({ a: 0, b: 100 });
    advance(50);
    expect(frames).toHaveLength(0);
    probe.playIntro();
    expect(probe.draws.at(-1)).toEqual({ a: 0, b: 100 });
    expect(frames).toHaveLength(0);
  });

  it('keeps filters and selection across a remount', () => {
    const { probe, mount } = setup(true);
    mount();
    probe.applyHighlight('a');
    probe.dispose();
    mount();
    expect(probe.unmounted).toBe(1);
    expect(probe.mounted).toBe(2);
    probe.applyFilters(defaultFilterState());
  });

  it('rebuilds on a changed collapse set only, not an identical one', () => {
    const { probe, mount } = setup(true);
    mount();
    probe.setCollapsed(new Set());
    expect(probe.modelCalls).toBe(0);
    probe.setCollapsed(new Set(['one']));
    expect(probe.modelCalls).toBe(1);
  });

  it('tweens a layout switch from where nodes are now, snapping when motion is off', () => {
    const { probe, mount, advance } = setup();
    mount();
    advance(INTRO_TIMING.nodeDurationMs + INTRO_TIMING.staggerMs + 10);
    probe.retarget({ a: { x: 0, y: 40 }, b: { x: 200, y: 40 } });
    expect(probe.draws.at(-1)).toEqual({ a: 0, b: 100 });
    advance(300);
    const mid = probe.draws.at(-1)!;
    expect(mid.b).toBeGreaterThan(100);
    expect(mid.b).toBeLessThan(200);
    advance(400);
    expect(probe.draws.at(-1)).toEqual({ a: 0, b: 200 });
  });

  it('flies animated unless paused', () => {
    const { probe, mount } = setup(true);
    mount();
    probe.focusNode('a');
    expect(probe.flown).toEqual([['a', false]]);
    probe.focusNode('nope');
    expect(probe.flown).toHaveLength(1);
  });
});

describe('ClickGate', () => {
  afterEach(() => vi.useRealTimers());

  it('fires a single click after the delay and a double click without the single', () => {
    vi.useFakeTimers();
    const single = vi.fn();
    const double = vi.fn();
    const gate = new ClickGate(single, double, 250);
    gate.click('a');
    vi.advanceTimersByTime(260);
    expect(single).toHaveBeenCalledWith('a');
    gate.click('b');
    gate.click('b');
    vi.advanceTimersByTime(300);
    expect(double).toHaveBeenCalledWith('b');
    expect(single).toHaveBeenCalledTimes(1);
  });
});
