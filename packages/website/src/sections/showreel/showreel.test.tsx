import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PilotVideo } from '../hero/pilot-video';
import { Showreel } from './showreel';

/** jsdom's `play` rejects with "not implemented"; stub it so the click resolves. */
beforeEach(() => {
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Showreel', () => {
  it('sources the showreel clip and its poster, not the pilot', () => {
    render(<Showreel />);
    const video = screen.getByTestId('showreel-video');
    expect(video.getAttribute('poster')).toBe('/video/midnite-apps-poster.jpg');
    expect(Array.from(video.querySelectorAll('source')).map((s) => s.getAttribute('src'))).toEqual([
      '/video/midnite-apps.mp4',
    ]);
  });

  it('downloads nothing and stays silent until the visitor clicks play', () => {
    render(<Showreel />);
    const video = screen.getByTestId('showreel-video');
    expect(video.getAttribute('preload')).toBe('none');
    expect(video.hasAttribute('autoplay')).toBe(false);
    expect(window.HTMLMediaElement.prototype.play).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Play the Midnite Apps showreel' }));
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  });

  it('names the player and the section', () => {
    render(<Showreel />);
    expect(screen.getByTestId('showreel-video').getAttribute('aria-label')).toMatch(
      /Midnite Apps showreel/,
    );
    expect(screen.getByRole('region', { name: 'Showreel' })).toBeTruthy();
  });

  it('pauses the pilot when the showreel starts, so two soundtracks never overlap', () => {
    const pause = vi
      .spyOn(window.HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => undefined);
    render(
      <>
        <Showreel />
        <PilotVideo />
      </>,
    );
    const pilot = screen.getByTestId('pilot-video');
    Object.defineProperty(pilot, 'paused', { value: false });

    fireEvent.play(screen.getByTestId('showreel-video'));

    expect(pause).toHaveBeenCalledTimes(1);
    expect(pause.mock.contexts[0]).toBe(pilot);
  });

  it('plays inline, so iOS keeps it in the frame', () => {
    render(<Showreel />);
    expect(screen.getByTestId('showreel-video')).toHaveProperty('playsInline', true);
  });
});
