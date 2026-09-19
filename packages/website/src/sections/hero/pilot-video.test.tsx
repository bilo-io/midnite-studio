import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PilotVideo } from './pilot-video';

/**
 * jsdom implements `HTMLMediaElement.play` as a stub that rejects with "not
 * implemented" — stubbed here so the play button's click handler resolves
 * instead of unhandled-rejecting the test.
 */
beforeEach(() => {
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() =>
    Promise.resolve(),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PilotVideo', () => {
  it('renders both sources, the poster and preload="none", so nothing downloads before a click', () => {
    render(<PilotVideo />);
    const video = screen.getByTestId('pilot-video');
    expect(video.getAttribute('preload')).toBe('none');
    expect(video.getAttribute('poster')).toBe('/video/pilot-intro-poster.jpg');
    expect(video.hasAttribute('autoplay')).toBe(false);
    expect(video.hasAttribute('muted')).toBe(false);
    expect(Array.from(video.querySelectorAll('source')).map((s) => s.getAttribute('src'))).toEqual(
      ['/video/pilot-intro.webm', '/video/pilot-intro.mp4'],
    );
  });

  it('gives the player a real accessible name', () => {
    render(<PilotVideo />);
    const video = screen.getByTestId('pilot-video');
    expect(video.getAttribute('aria-label')).toMatch(/Damion introduces Midnite Studio/);
  });

  it('has native controls, so playback is keyboard-operable once it starts', () => {
    render(<PilotVideo />);
    expect(screen.getByTestId('pilot-video')).toHaveProperty('controls', true);
  });

  it('does not play until the overlay button is activated', () => {
    render(<PilotVideo />);
    expect(window.HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('pilot-video-play'));
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  });

  it('removes the play overlay once playback has started', () => {
    render(<PilotVideo />);
    expect(screen.queryByTestId('pilot-video-play')).not.toBeNull();
    fireEvent.click(screen.getByTestId('pilot-video-play'));
    expect(screen.queryByTestId('pilot-video-play')).toBeNull();
  });

  it('names the play control for a visitor who has not started it yet', () => {
    render(<PilotVideo />);
    expect(screen.getByRole('button', { name: 'Play the introduction video' })).toBeTruthy();
  });
});
