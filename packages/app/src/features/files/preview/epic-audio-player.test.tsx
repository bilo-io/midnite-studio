import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import {
  compute3DShapeVertex,
  computeGlowTier,
  EpicAudioPlayer,
  PARTICLE_COUNT_3D,
  project3D,
  rotate3D,
  SHAPE_NAMES,
} from './epic-audio-player';

describe('EpicAudioPlayer (5-Layer 3D Visualizer & Floating Player)', () => {
  let playSpy: Mock;
  let pauseSpy: Mock;

  beforeEach(() => {
    playSpy = vi.fn().mockImplementation(function (this: HTMLMediaElement) {
      Object.defineProperty(this, 'paused', { value: false, configurable: true });
      return Promise.resolve();
    });
    pauseSpy = vi.fn().mockImplementation(function (this: HTMLMediaElement) {
      Object.defineProperty(this, 'paused', { value: true, configurable: true });
    });

    window.HTMLMediaElement.prototype.play = playSpy;
    window.HTMLMediaElement.prototype.pause = pauseSpy;

    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      createRadialGradient: vi.fn().mockReturnValue({
        addColorStop: vi.fn(),
      }),
      createLinearGradient: vi.fn().mockReturnValue({
        addColorStop: vi.fn(),
      }),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders 3D audio player container, canvas, audio element, and floating controls', () => {
    render(<EpicAudioPlayer src="mstudio-file://repo/audio/track.mp3" fileName="track.mp3" />);

    expect(screen.getByTestId('epic-audio-player-container')).toBeDefined();
    expect(screen.getByTestId('epic-audio-canvas')).toBeDefined();
    expect(screen.getByTestId('epic-audio-element')).toBeDefined();
    expect(screen.getByText('track.mp3')).toBeDefined();
    expect(screen.getByText('3D')).toBeDefined();
    expect(screen.getByText('Paused')).toBeDefined();
    expect(screen.getByTestId('epic-play-pause-btn')).toBeDefined();
    expect(screen.getByLabelText('Seek track')).toBeDefined();
    expect(screen.getByLabelText('Adjust volume')).toBeDefined();
  });

  it('toggles playback when clicking the floating play/pause button', () => {
    render(<EpicAudioPlayer src="mstudio-file://repo/audio/beat.wav" fileName="beat.wav" />);

    const playBtn = screen.getByTestId('epic-play-pause-btn');
    fireEvent.click(playBtn);
    expect(playSpy).toHaveBeenCalled();

    const audioEl = screen.getByTestId('epic-audio-element') as HTMLAudioElement;
    fireEvent.play(audioEl);
    expect(screen.getByText('Playing')).toBeDefined();

    fireEvent.click(playBtn);
    expect(pauseSpy).toHaveBeenCalled();

    fireEvent.pause(audioEl);
    expect(screen.getByText('Paused')).toBeDefined();
  });

  it('resets time when clicking the restart button', () => {
    render(<EpicAudioPlayer src="mstudio-file://repo/audio/song.flac" fileName="song.flac" />);

    const audioEl = screen.getByTestId('epic-audio-element') as HTMLAudioElement;
    audioEl.currentTime = 42;

    const restartBtn = screen.getByLabelText('Restart track');
    fireEvent.click(restartBtn);

    expect(audioEl.currentTime).toBe(0);
  });

  it('toggles loop mode on and off', () => {
    render(<EpicAudioPlayer src="mstudio-file://repo/audio/loop.ogg" fileName="loop.ogg" />);

    const audioEl = screen.getByTestId('epic-audio-element') as HTMLAudioElement;
    const loopBtn = screen.getByLabelText('Toggle loop');

    expect(audioEl.loop).toBe(false);

    fireEvent.click(loopBtn);
    expect(audioEl.loop).toBe(true);

    fireEvent.click(loopBtn);
    expect(audioEl.loop).toBe(false);
  });

  it('adjusts volume and toggles mute state', () => {
    render(<EpicAudioPlayer src="mstudio-file://repo/audio/ambient.mp3" fileName="ambient.mp3" />);

    const audioEl = screen.getByTestId('epic-audio-element') as HTMLAudioElement;
    const volumeSlider = screen.getByLabelText('Adjust volume') as HTMLInputElement;
    const muteBtn = screen.getByLabelText('Toggle mute');

    fireEvent.change(volumeSlider, { target: { value: '0.4' } });
    expect(audioEl.volume).toBe(0.4);

    fireEvent.click(muteBtn);
    expect(audioEl.muted).toBe(true);

    fireEvent.click(muteBtn);
    expect(audioEl.muted).toBe(false);
  });

  it('cycles through all 5 3D sacred geometry and fractal shapes when clicking the shape chip', () => {
    render(<EpicAudioPlayer src="mstudio-file://repo/audio/synth.wav" fileName="synth.wav" />);

    expect(SHAPE_NAMES).toEqual([
      'Tesseract Hypercube',
      'Menger Fractal Lattice',
      'Geodesic Lorenz Attractor',
      'Torus Knot Vortex',
      'Merkaba Fractal Star',
    ]);
    expect(screen.getByText(SHAPE_NAMES[0])).toBeDefined();

    const shapeBtn = screen.getByTitle('Click to cycle morph shape');
    fireEvent.click(shapeBtn);
    expect(screen.getByText(SHAPE_NAMES[1])).toBeDefined();

    fireEvent.click(shapeBtn);
    expect(screen.getByText(SHAPE_NAMES[2])).toBeDefined();
  });

  it('seeks through audio with the track slider and reports progress callbacks', () => {
    const onProgress = vi.fn();
    const onLoadedMetadataDuration = vi.fn();
    render(
      <EpicAudioPlayer
        src="mstudio-file://repo/audio/track.mp3"
        fileName="track.mp3"
        resumeAt={15}
        onProgress={onProgress}
        onLoadedMetadataDuration={onLoadedMetadataDuration}
      />,
    );

    const audioEl = screen.getByTestId('epic-audio-element') as HTMLAudioElement;
    Object.defineProperty(audioEl, 'duration', { value: 120, configurable: true });
    fireEvent.loadedMetadata(audioEl);
    expect(onLoadedMetadataDuration).toHaveBeenCalledWith(120);
    expect(audioEl.currentTime).toBe(15);

    const seekSlider = screen.getByLabelText('Seek track');
    fireEvent.change(seekSlider, { target: { value: '25' } });
    expect(audioEl.currentTime).toBe(25);

    fireEvent.timeUpdate(audioEl);
    expect(onProgress).toHaveBeenCalledWith(25, 120, 'playing');
  });

  it('computes 3D shape vertices, 3D rotations, perspective projection, 160-particle count, and 3-tier glow', () => {
    expect(PARTICLE_COUNT_3D).toBe(160);

    for (let s = 0; s < SHAPE_NAMES.length; s++) {
      const v = compute3DShapeVertex(s, 12, 96, 1.5);
      expect(v).toHaveLength(3);
      expect(Number.isFinite(v[0])).toBe(true);
      expect(Number.isFinite(v[1])).toBe(true);
      expect(Number.isFinite(v[2])).toBe(true);

      const rotated = rotate3D(v, 0.4, 0.7, 0.2);
      const proj = project3D(rotated, 320, 200, 420, 450);
      expect(proj.visible).toBe(true);
      expect(proj.scale).toBeGreaterThan(0);
    }

    expect(computeGlowTier(0.05, 0)).toBe(1);
    expect(computeGlowTier(0.38, 0.35)).toBe(2);
    expect(computeGlowTier(0.75, 0.9)).toBe(3);
  });
});
