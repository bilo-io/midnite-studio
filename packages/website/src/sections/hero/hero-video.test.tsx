import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { setTheme } from '../../theme';

import { HeroVideo } from './hero-video';

afterEach(() => {
  setTheme('system');
});

describe('HeroVideo', () => {
  it('renders the video with both sources and the dark poster', () => {
    render(<HeroVideo />);
    const video = screen.getByTestId('hero-video');
    expect(video.getAttribute('poster')).toBe(
      '/img/app-showcase/multi-screen-horizontal-dark.png',
    );
    expect(Array.from(video.querySelectorAll('source')).map((s) => s.getAttribute('src'))).toEqual([
      '/video/hero.webm',
      '/video/hero.mp4',
    ]);
  });

  it('falls back to the poster image when the sources fail', () => {
    // `public/video/` is empty by design — this is the committed state of the
    // repo, not an edge case.
    render(<HeroVideo />);
    fireEvent.error(screen.getByTestId('hero-video'));
    expect(screen.queryByTestId('hero-video')).toBeNull();
    const poster = screen.getByTestId('hero-poster');
    expect(poster.querySelector('img')?.getAttribute('src')).toBe(
      '/img/app-showcase/multi-screen-horizontal-dark.png',
    );
  });

  it('falls back to the light poster when the theme resolves to light', () => {
    setTheme('light');
    render(<HeroVideo />);
    fireEvent.error(screen.getByTestId('hero-video'));
    const poster = screen.getByTestId('hero-poster');
    expect(poster.querySelector('img')?.getAttribute('src')).toBe(
      '/img/app-showcase/multi-screen-horizontal-light.png',
    );
  });
});
