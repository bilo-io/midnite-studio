import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HeroVideo } from './hero-video';

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
    // And the light variant is offered to a light-theme visitor.
    expect(poster.querySelector('source')?.getAttribute('media')).toBe(
      '(prefers-color-scheme: light)',
    );
  });
});
