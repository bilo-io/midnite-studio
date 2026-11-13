import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FrameChromeProvider } from '@midnite/studio-frame';

import { SIMULATOR_CHROME } from '../compose/simulator-chrome';
import { SimCanvasFrame, Transport, type TransportProps } from './transport';

afterEach(cleanup);

const base = (over: Partial<TransportProps> = {}): TransportProps => ({
  playing: false,
  onPlay: vi.fn(),
  onPause: vi.fn(),
  onStep: vi.fn(),
  onReset: vi.fn(),
  speed: 1,
  onSpeed: vi.fn(),
  seed: 42,
  onSeed: vi.fn(),
  tick: 12,
  stats: { population: 30 },
  ...over,
});

const wrap = (ui: React.ReactNode) => render(<FrameChromeProvider chrome={SIMULATOR_CHROME}>{ui}</FrameChromeProvider>);

describe('Transport', () => {
  it('disables Step while playing and offers Pause instead of Play', () => {
    wrap(<Transport {...base({ playing: true })} />);
    expect(screen.getByRole('button', { name: 'Step' }).hasAttribute('disabled') || screen.getByRole('button', { name: 'Step' }).getAttribute('aria-disabled') === 'true').toBe(true);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDefined();
  });

  it('reads out tick and stats, and applies a seed on Enter', () => {
    const p = base();
    wrap(<Transport {...p} />);
    expect(screen.getByText('tick 12 · population 30')).toBeDefined();
    const seed = screen.getByLabelText('Seed');
    fireEvent.change(seed, { target: { value: '99' } });
    fireEvent.keyDown(seed, { key: 'Enter' });
    expect(p.onSeed).toHaveBeenCalledWith(99);
  });

  it('ignores a non-integer seed', () => {
    const p = base();
    wrap(<Transport {...p} />);
    const seed = screen.getByLabelText('Seed');
    fireEvent.change(seed, { target: { value: 'abc' } });
    fireEvent.keyDown(seed, { key: 'Enter' });
    expect(p.onSeed).not.toHaveBeenCalled();
  });
});

describe('SimCanvasFrame', () => {
  it('Space toggles play, and . steps only while paused', () => {
    const p = { playing: false, onPlay: vi.fn(), onPause: vi.fn(), onStep: vi.fn() };
    const { rerender } = render(<SimCanvasFrame {...p}>x</SimCanvasFrame>);
    const frame = screen.getByLabelText('Simulation canvas');
    fireEvent.keyDown(frame, { key: ' ' });
    expect(p.onPlay).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(frame, { key: '.' });
    expect(p.onStep).toHaveBeenCalledTimes(1);
    rerender(<SimCanvasFrame {...p} playing>x</SimCanvasFrame>);
    fireEvent.keyDown(frame, { key: ' ' });
    expect(p.onPause).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(frame, { key: '.' });
    expect(p.onStep).toHaveBeenCalledTimes(1);
  });
});
