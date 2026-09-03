import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppearanceStore } from '../../store/appearance-store';
import { NeuroCloudBackground } from './neuro-cloud-background';

/**
 * Phase 46 Theme E — the one animation none of `styles.css`'s guards can
 * reach. Before this fix, whether the loop kept running depended on the
 * caller resolving `motion` correctly (`screensaver.tsx` used to compute
 * `motion !== 'reduced'`, which treats the default `'system'` as "animate"
 * even when the OS asks for stillness). Now the component resolves it itself.
 */
function mockMatchMedia(reduced: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: reduced,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function fakeContext() {
  return {
    clearRect: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillStyle: '',
  };
}

describe('NeuroCloudBackground (Phase 46 Theme E)', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      fakeContext() as unknown as CanvasRenderingContext2D,
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not schedule another frame when 'system' resolves to reduced", () => {
    mockMatchMedia(true);
    useAppearanceStore.setState({ motion: 'system' });
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');

    render(<NeuroCloudBackground />);

    expect(rafSpy).not.toHaveBeenCalled();
  });

  it("schedules frames when 'system' resolves to full", () => {
    mockMatchMedia(false);
    useAppearanceStore.setState({ motion: 'system' });
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0);

    render(<NeuroCloudBackground />);

    expect(rafSpy).toHaveBeenCalled();
  });

  it('respects an explicit reduced choice regardless of what the OS says', () => {
    mockMatchMedia(false); // OS says full motion...
    useAppearanceStore.setState({ motion: 'reduced' }); // ...but the user overrode it.
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');

    render(<NeuroCloudBackground />);

    expect(rafSpy).not.toHaveBeenCalled();
  });

  it('never animates when the caller passes animate=false, regardless of motion', () => {
    mockMatchMedia(false);
    useAppearanceStore.setState({ motion: 'full' });
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');

    render(<NeuroCloudBackground animate={false} />);

    expect(rafSpy).not.toHaveBeenCalled();
  });
});
