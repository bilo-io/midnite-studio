import { COMPANION_LEVEL_VAR, type CompanionState } from '@midnite/studio-shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCompanionStore } from '../../store/companion-store';
import {
  CompanionOrb,
  computeSphericalHarmonicVertex,
  ORB_FIBONACCI_NODES,
  ORB_FOG_CLOUD_COUNT,
  ORB_PARTICLE_COUNT,
  ORB_STATE_PROFILES,
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
    expect(ORB_FIBONACCI_NODES).toBeGreaterThanOrEqual(64);
    expect(ORB_FOG_CLOUD_COUNT).toBeGreaterThanOrEqual(24);
    expect(ORB_PARTICLE_COUNT).toBeGreaterThanOrEqual(80);
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

    beforeEach(() => {
      rafCallbacks = [];
      arcCalls = 0;
      strokeCalls = 0;

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
        lineTo: vi.fn(),
        arc: vi.fn(() => {
          arcCalls += 1;
        }),
        fill: vi.fn(),
        stroke: vi.fn(() => {
          strokeCalls += 1;
        }),
        createRadialGradient: vi.fn(() => mockGrad),
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

      // Should draw corona + 34 fog clouds + 88 geodesic nodes + 110 particles + vocal shells
      expect(arcCalls).toBeGreaterThan(ORB_FOG_CLOUD_COUNT + ORB_FIBONACCI_NODES);
      expect(strokeCalls).toBeGreaterThan(20);

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
