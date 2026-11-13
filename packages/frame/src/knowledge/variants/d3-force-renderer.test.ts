// Layer: vitest/jsdom — simulation lifecycle (settle ceiling, pause halts, collapse re-seeds) with a stubbed 2D context and a fake frame clock. Real pixels are the human/visual check.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { KnowledgeGraphPayload } from '@midnite/studio-shared';

import { D3ForceRenderer } from './d3-force-renderer';
import { SETTLE } from './d3-force-settle';

const payload = {
  nodes: [
    { id: 'a', label: 'A', community: 0, communityName: 'one', fileType: 'code' },
    { id: 'b', label: 'B', community: 0, communityName: 'one', fileType: 'code' },
    { id: 'c', label: 'C', community: 1, communityName: 'two', fileType: 'code' },
  ],
  links: [
    { source: 'a', target: 'b', relation: 'calls', weight: 1, confidence: 1 },
    { source: 'b', target: 'c', relation: 'calls', weight: 1, confidence: 1 },
  ],
  positions: { a: { x: 0, y: 0 }, b: { x: 50, y: 0 }, c: { x: 100, y: 0 } },
  builtAtCommit: 'x',
  cached: false,
  commitsBehind: null,
} as unknown as KnowledgeGraphPayload;

describe('D3ForceRenderer', () => {
  beforeAll(() => {
    const ctx = new Proxy({}, { get: () => () => ({ width: 1 }), set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  });
  afterEach(() => vi.clearAllMocks());

  /** A manual frame clock: `now` advances 1 ms per call so the frame budget is spent deterministically. */
  function setup(reduced: boolean) {
    let t = 0;
    let pending: (() => void) | null = null;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const renderer = new D3ForceRenderer({
      prefersReducedMotion: () => reduced,
      colorFor: () => 'rgb(1, 2, 3)',
      now: () => (t += 1),
      requestFrame: (cb) => {
        pending = cb;
        return 1;
      },
      cancelFrame: () => {
        pending = null;
      },
    });
    renderer.mount(container, payload, { onNodeClick: () => {}, onNodeDoubleClick: () => {} }, { maxNodes: Infinity });
    const runFrame = () => {
      const cb = pending;
      pending = null;
      cb?.();
    };
    return { renderer, runFrame, hasFrame: () => pending !== null, advance: (ms: number) => (t += ms) };
  }

  it('reduced motion settles at once and schedules no frame', () => {
    const { renderer, hasFrame } = setup(true);
    expect(renderer.simulationState.state).not.toBe('running');
    expect(renderer.simulationState.frameScheduled).toBe(false);
    expect(hasFrame()).toBe(false);
    renderer.dispose();
  });

  it('runs frame by frame and never schedules another after it stops', () => {
    const { renderer, runFrame, hasFrame } = setup(false);
    expect(renderer.simulationState.state).toBe('running');
    for (let i = 0; i < 400 && hasFrame(); i += 1) runFrame();
    const { state, ticks } = renderer.simulationState;
    expect(['settled', 'ceiling']).toContain(state);
    expect(ticks).toBeLessThanOrEqual(SETTLE.maxTicks);
    expect(hasFrame()).toBe(false);
    renderer.dispose();
  });

  it('pause halts the simulation and unpause resumes it', () => {
    const { renderer, runFrame, hasFrame } = setup(false);
    runFrame();
    renderer.setPaused(true);
    expect(hasFrame()).toBe(false);
    const ticksAtPause = renderer.simulationState.ticks;
    runFrame();
    expect(renderer.simulationState.ticks).toBe(ticksAtPause);
    renderer.setPaused(false);
    if (renderer.simulationState.state === 'running') expect(hasFrame()).toBe(true);
    renderer.dispose();
  });

  it('a collapse re-settles from the previous positions within the smaller ceiling', () => {
    const { renderer, runFrame, hasFrame } = setup(false);
    for (let i = 0; i < 400 && hasFrame(); i += 1) runFrame();
    renderer.setCollapsed(new Set(['one']));
    expect(renderer.simulationState.state).toBe('running');
    for (let i = 0; i < 400 && hasFrame(); i += 1) runFrame();
    expect(renderer.simulationState.ticks).toBeLessThanOrEqual(SETTLE.maxTicksResettle);
    expect(hasFrame()).toBe(false);
    renderer.dispose();
  });

  it('dispose cancels the pending frame', () => {
    const { renderer, hasFrame } = setup(false);
    expect(hasFrame()).toBe(true);
    renderer.dispose();
    expect(hasFrame()).toBe(false);
  });
});
