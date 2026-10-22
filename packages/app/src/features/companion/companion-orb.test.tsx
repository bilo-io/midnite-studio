import { COMPANION_LEVEL_VAR, type CompanionState } from '@midnite/studio-shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCompanionStore } from '../../store/companion-store';
import {
  CompanionOrb,
  computeSphericalHarmonicVertex,
  ORB_FIBONACCI_NODES,
  ORB_FOG_CLOUD_COUNT,
  ORB_INNER_SHELL_NODES,
  ORB_PARTICLE_COUNT,
  ORB_STATE_PROFILES,
  ORB_ZEN_GLOW_BLEED,
  orbBaseRadius,
  orbCoronaRadius,
  readCompanionSpeechLevel,
} from './companion-orb';
import { CompanionPanel } from './companion-panel';
import { renderPanel } from './render-panel';

afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty(COMPANION_LEVEL_VAR);
  vi.restoreAllMocks();
});

describe('CompanionOrb 3D Jarvis spherical visualizer', () => {
  it('defines distinct visual profiles for all companion states', () => {
    const states: CompanionState[] = [
      'off',
      'idle',
      'greeting',
      'listening',
      'thinking',
      'speaking',
      'handoff',
    ];
    for (const st of states) {
      const profile = ORB_STATE_PROFILES[st];
      expect(profile).toBeDefined();
      expect(profile.label.length).toBeGreaterThan(0);
      expect(profile.fogDensity).toBeGreaterThan(0);
    }

    expect(ORB_STATE_PROFILES.idle.mode).toBe('idle');
    expect(ORB_STATE_PROFILES.listening.mode).toBe('listening');
    expect(ORB_STATE_PROFILES.thinking.mode).toBe('thinking');
    expect(ORB_STATE_PROFILES.speaking.mode).toBe('speaking');
    expect(ORB_STATE_PROFILES.greeting.mode).toBe('speaking');
    expect(ORB_STATE_PROFILES.handoff.mode).toBe('handoff');

    // Thinking spins faster than idle; speaking has stronger harmonic amplitude than idle
    expect(ORB_STATE_PROFILES.thinking.rotSpeed).toBeGreaterThan(ORB_STATE_PROFILES.idle.rotSpeed);
    expect(ORB_STATE_PROFILES.speaking.harmonicAmp).toBeGreaterThan(
      ORB_STATE_PROFILES.idle.harmonicAmp,
    );
  });

  it('exposes volumetric 3D counts for Fibonacci shell, fog clouds, and particle swarm', () => {
    expect(ORB_FIBONACCI_NODES).toBeGreaterThanOrEqual(144);
    expect(ORB_INNER_SHELL_NODES).toBeGreaterThanOrEqual(34);
    expect(ORB_FOG_CLOUD_COUNT).toBeGreaterThanOrEqual(24);
    expect(ORB_PARTICLE_COUNT).toBeGreaterThanOrEqual(250);
  });

  it('keeps the corona inside the canvas while it breathes and swells with speech', () => {
    const half = 150;
    for (const speech of [0, 0.5, 1]) {
      for (const breath of [-1, 0, 1]) {
        expect(orbCoronaRadius(100, speech, breath, half)).toBeLessThanOrEqual(half);
      }
    }
    // Breathing still changes the radius when the corona is held at the cap (docked).
    expect(orbCoronaRadius(100, 0, 1, half)).toBeGreaterThan(orbCoronaRadius(100, 0, -1, half));
  });

  it('gives the zen corona room to fade out unclamped at full speech and pulse', () => {
    const layoutMin = 520;
    const canvasHalf = (layoutMin * (1 + 2 * ORB_ZEN_GLOW_BLEED)) / 2;
    const peakBase = orbBaseRadius(layoutMin, 1, 1);
    const unclamped = orbCoronaRadius(peakBase, 1, 1, Number.POSITIVE_INFINITY);
    expect(orbCoronaRadius(peakBase, 1, 1, canvasHalf)).toBe(unclamped);
  });

  it('lets the zen canvas bleed past its box so the glow is not cut off, while the docked canvas fills its box', () => {
    const { rerender } = render(<CompanionOrb state="idle" zen />);
    const canvas = screen.getByTestId('companion-orb-canvas');
    const bleed = `${ORB_ZEN_GLOW_BLEED * 100}%`;
    expect(canvas.style.left).toBe(`-${bleed}`);
    expect(canvas.style.width).toBe(`${(1 + 2 * ORB_ZEN_GLOW_BLEED) * 100}%`);

    rerender(<CompanionOrb state="idle" />);
    expect(screen.getByTestId('companion-orb-canvas').style.width).toBe('');
  });

  it('masks both canvases so every layer fades out before the canvas edge', () => {
    const { rerender } = render(<CompanionOrb state="idle" zen />);
    expect(screen.getByTestId('companion-orb-canvas').getAttribute('style')).toMatch(/mask-image:\s*radial-gradient\(closest-side/);
    rerender(<CompanionOrb state="idle" />);
    expect(screen.getByTestId('companion-orb-canvas').getAttribute('style')).toMatch(/mask-image:\s*radial-gradient\(closest-side/);
  });

  it('reads and clamps --companion-level from document.documentElement', () => {
    expect(readCompanionSpeechLevel()).toBe(0);

    document.documentElement.style.setProperty(COMPANION_LEVEL_VAR, '0.68');
    expect(readCompanionSpeechLevel()).toBeCloseTo(0.68, 2);

    document.documentElement.style.setProperty(COMPANION_LEVEL_VAR, '1.45');
    expect(readCompanionSpeechLevel()).toBe(1);

    document.documentElement.style.setProperty(COMPANION_LEVEL_VAR, '-0.3');
    expect(readCompanionSpeechLevel()).toBe(0);
  });

  it('computes 3D spherical harmonic vertices that deform with speech energy', () => {
    const quietVertex = computeSphericalHarmonicVertex(
      12,
      ORB_FIBONACCI_NODES,
      50,
      1.2,
      0.24,
      0,
      'speaking',
    );
    const loudVertex = computeSphericalHarmonicVertex(
      12,
      ORB_FIBONACCI_NODES,
      50,
      1.2,
      0.24,
      0.95,
      'speaking',
    );

    const quietMag = Math.hypot(quietVertex[0], quietVertex[1], quietVertex[2]);
    const loudMag = Math.hypot(loudVertex[0], loudVertex[1], loudVertex[2]);

    expect(quietMag).toBeGreaterThan(25);
    expect(loudMag).toBeGreaterThan(25);
    expect(loudMag).not.toBeCloseTo(quietMag, 3);
  });

  describe('canvas 3D rendering across states', () => {
    let rafCallbacks: FrameRequestCallback[] = [];
    let arcCalls = 0;
    let strokeCalls = 0;
    let lineToCalls = 0;

    beforeEach(() => {
      rafCallbacks = [];
      arcCalls = 0;
      strokeCalls = 0;
      lineToCalls = 0;

      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      });
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

      const mockGrad = { addColorStop: vi.fn() };
      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        scale: vi.fn(),
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(() => {
          lineToCalls += 1;
        }),
        arc: vi.fn(() => {
          arcCalls += 1;
        }),
        fill: vi.fn(),
        stroke: vi.fn(() => {
          strokeCalls += 1;
        }),
        createRadialGradient: vi.fn(() => mockGrad),
        globalCompositeOperation: 'source-over',
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
      };

      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        mockCtx as unknown as RenderingContext,
      );
    });

    it('renders the 5 volumetric 3D orb layers and updates mode badge across states', () => {
      document.documentElement.style.setProperty(COMPANION_LEVEL_VAR, '0.75');
      const { rerender } = render(<CompanionOrb state="speaking" />);

      expect(screen.getByTestId('companion-orb').getAttribute('data-orb-mode')).toBe('speaking');
      expect(screen.getByTestId('companion-orb-mode-badge').textContent).toBe('Vocal Resonance');

      // Flush one animation frame
      const firstCb = rafCallbacks.shift();
      expect(firstCb).toBeDefined();
      firstCb?.(16);

      // Should draw corona + core + fog clouds + both lattices + particles + vocal shells
      expect(arcCalls).toBeGreaterThan(ORB_FOG_CLOUD_COUNT + ORB_FIBONACCI_NODES);
      // Lattice edges are batched into a few stroked paths, so count the edges rather than strokes.
      expect(lineToCalls).toBeGreaterThan(ORB_FIBONACCI_NODES + ORB_INNER_SHELL_NODES);
      expect(strokeCalls).toBeGreaterThanOrEqual(4);

      // Switch to thinking state and verify synaptic arc mode
      rerender(<CompanionOrb state="thinking" />);
      expect(screen.getByTestId('companion-orb').getAttribute('data-orb-mode')).toBe('thinking');
      expect(screen.getByTestId('companion-orb-mode-badge').textContent).toBe('Synaptic Matrix');

      const nextCb = rafCallbacks.shift();
      nextCb?.(32);
    });
  });

  it('mounts inside CompanionPanel and reflects store state transitions', () => {
    useCompanionStore.setState({ state: 'idle', transcript: [], activeHandoff: null });
    const { rerender } = renderPanel(<CompanionPanel />);

    expect(screen.getByTestId('companion-orb').getAttribute('data-orb-mode')).toBe('idle');
    expect(screen.getByTestId('companion-orb-mode-badge').textContent).toBe('Standby Core');

    useCompanionStore.setState({ state: 'listening' });
    rerender(<CompanionPanel />);
    expect(screen.getByTestId('companion-orb').getAttribute('data-orb-mode')).toBe('listening');
    expect(screen.getByTestId('companion-orb-mode-badge').textContent).toBe('Acoustic Intake');
  });
});
