import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EpicAudioPlayer, SHAPE_NAMES } from './epic-audio-player';

describe('EpicAudioPlayer', () => {
  let playSpy: ReturnType<typeof vi.fn>;
  let pauseSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    playSpy = vi.fn().mockImplementation(function (this: HTMLMediaElement) {
      Object.defineProperty(this, 'paused', { value: false, configurable: true });
      return Promise.resolve();
    });
    pauseSpy = vi.fn().mockImplementation(function (this: HTMLMediaElement) {
      Object.defineProperty(this, 'paused', { value: true, configurable: true });
    });

    // Mock HTMLMediaElement methods in jsdom
    window.HTMLMediaElement.prototype.play = playSpy;
    window.HTMLMediaElement.prototype.pause = pauseSpy;

    // Mock canvas 2D context
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

  it('renders audio player container, canvas, audio element, and floating controls', () => {
    render(<EpicAudioPlayer src="mstudio-file://repo/audio/track.mp3" fileName="track.mp3" />);

    expect(screen.getByTestId('epic-audio-player-container')).toBeDefined();
    expect(screen.getByTestId('epic-audio-canvas')).toBeDefined();
    expect(screen.getByTestId('epic-audio-element')).toBeDefined();
    expect(screen.getByText('track.mp3')).toBeDefined();
    expect(screen.getByText('Paused')).toBeDefined();
    expect(screen.getByTestId('epic-play-pause-btn')).toBeDefined();
    expect(screen.getByLabelText('Seek track')).toBeDefined();
    expect(screen.getByLabelText('Adjust volume')).toBeDefined();
  });

  it('toggles playback when clicking the floating play/pause button', () => {
    render(<EpicAudioPlayer src="mstudio-file://repo/audio/beat.wav" fileName="beat.wav" />);

    const playBtn = screen.getByTestId('epic-play-pause-btn');
    expect(playBtn).toBeDefined();

    // Click play
    fireEvent.click(playBtn);
    expect(playSpy).toHaveBeenCalled();

    // Trigger onPlay event on audio element
    const audioEl = screen.getByTestId('epic-audio-element') as HTMLAudioElement;
    fireEvent.play(audioEl);
    expect(screen.getByText('Playing')).toBeDefined();

    // Click pause
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

    // Change volume
    fireEvent.change(volumeSlider, { target: { value: '0.4' } });
    expect(audioEl.volume).toBe(0.4);

    // Mute
    fireEvent.click(muteBtn);
    expect(audioEl.muted).toBe(true);

    // Unmute
    fireEvent.click(muteBtn);
    expect(audioEl.muted).toBe(false);
  });

  it('cycles through morphing shapes when clicking the shape chip', () => {
    render(<EpicAudioPlayer src="mstudio-file://repo/audio/synth.wav" fileName="synth.wav" />);

    expect(screen.getByText(SHAPE_NAMES[0])).toBeDefined();

    const shapeBtn = screen.getByTitle('Click to cycle morph shape');
    fireEvent.click(shapeBtn);
    expect(screen.getByText(SHAPE_NAMES[1])).toBeDefined();

    fireEvent.click(shapeBtn);
    expect(screen.getByText(SHAPE_NAMES[2])).toBeDefined();
  });

  it('seeks through audio with the track slider', () => {
    render(<EpicAudioPlayer src="mstudio-file://repo/audio/track.mp3" fileName="track.mp3" />);

    const audioEl = screen.getByTestId('epic-audio-element') as HTMLAudioElement;
    const seekSlider = screen.getByLabelText('Seek track');

    fireEvent.change(seekSlider, { target: { value: '25' } });
    expect(audioEl.currentTime).toBe(25);
  });

  it('updates container glow tier attribute', () => {
    const { container } = render(
      <EpicAudioPlayer src="mstudio-file://repo/audio/edm.mp3" fileName="edm.mp3" />,
    );

    const playerContainer = container.querySelector('[data-testid="epic-audio-player-container"]');
    expect(playerContainer).toBeDefined();
    // Default tier is 1 (subtle)
    expect(playerContainer?.getAttribute('data-glow-tier')).toBe('1');
  });
});
