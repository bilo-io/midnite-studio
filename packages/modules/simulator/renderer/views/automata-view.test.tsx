// vitest/jsdom: the view over a fake worker. Real layout, canvas pixels and pointer drags are not asserted here.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrameChromeProvider } from '@midnite/studio-frame';

import { SIMULATOR_CHROME } from '../compose/simulator-chrome';
import type { SimIn } from '../engine/types';
import type { SimWorkerLike } from '../engine/use-sim';

class FakeWorker implements SimWorkerLike {
  static all: FakeWorker[] = [];
  posts: SimIn[] = [];
  onmessage: SimWorkerLike['onmessage'] = null;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(m: SimIn) {
    this.posts.push(m);
  }
  terminate() {}
}

vi.mock('../engine/sim-worker-factory', async () => {
  const { createUseSim: make } = await import('../engine/use-sim');
  return { useSim: make(() => new FakeWorker()) };
});

import { AutomataView } from './automata-view';

const mount = () => render(<FrameChromeProvider chrome={SIMULATOR_CHROME}><AutomataView /></FrameChromeProvider>);
const last = () => FakeWorker.all.at(-1)!;
const inits = () => last().posts.filter((p) => p.type === 'init');
const frame = () => act(() => last().onmessage?.({ data: { type: 'frame', tick: 0, length: 256 * 256, buffer: new ArrayBuffer(256 * 256 * 4), stats: { population: 0, generation: 0 } } }));

beforeEach(() => {
  FakeWorker.all = [];
  // jsdom has no canvas; the pixels are out of scope here.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => {
    fn();
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AutomataView', () => {
  it('opens on a seeded Life grid, paused, with the default rule', () => {
    mount();
    expect(inits()[0]).toEqual({ type: 'init', kind: 'life', params: { width: 256, height: 256, rule: 'B3/S23', density: 0.3 }, seed: 42 });
    expect(screen.getByRole('button', { name: 'Play' })).toBeDefined();
  });

  it('shows the rule hint for an invalid custom rule and does not apply it', () => {
    mount();
    fireEvent.change(screen.getByLabelText(/Custom rule/), { target: { value: 'X3' } });
    expect(screen.getByText('Rule must look like B3/S23')).toBeDefined();
    expect(inits()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText(/Custom rule/), { target: { value: 'B36/S23' } });
    expect(inits()).toHaveLength(2);
    expect((inits()[1] as { params: { rule: string } }).params.rule).toBe('B36/S23');
  });

  it('switches to Elementary, which re-inits as a new kind', () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Elementary' }));
    expect(screen.getByLabelText('Rule (0–255)')).toBeDefined();
    expect(inits().at(-1)).toMatchObject({ kind: 'elementary', params: { rule: 90, start: 'single' } });
  });

  it('stamps a pattern at the grid centre as a restore once a frame has arrived', () => {
    mount();
    frame();
    fireEvent.click(screen.getByRole('button', { name: 'Stamp' }));
    const restore = last().posts.find((p) => p.type === 'restore') as { state: { width: number; cells: Uint8Array } };
    expect(restore.state.width).toBe(256);
    expect(restore.state.cells.reduce((a, b) => a + b, 0)).toBe(5);
  });

  it('reports a malformed or oversized pasted RLE inline', () => {
    mount();
    frame();
    fireEvent.click(screen.getByRole('button', { name: 'Paste RLE…' }));
    fireEvent.change(screen.getByLabelText('RLE'), { target: { value: 'b?o!' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Stamp' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Unexpected/);
    fireEvent.change(screen.getByLabelText('RLE'), { target: { value: 'x = 300, y = 1\n300o!' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Stamp' }));
    expect(screen.getByRole('alert').textContent).toBe('Pattern is 300×1; the grid is 256×256');
  });
});
