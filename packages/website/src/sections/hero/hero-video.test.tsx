import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { setTheme } from '../../theme';

import { HeroVideo } from './hero-video';

afterEach(() => {
  setTheme('system');
});

/**
 * The files that actually exist under `public/video/`, keyed by basename.
 * `import.meta.glob` is a Vite/vitest build-time feature (not a `node:fs`
 * import, which the website's eslint boundary denies — a static site bundle
 * never ships node builtins), and it resolves this pattern against the real
 * filesystem: a path that is not on disk simply never appears as a key here.
 */
const publicVideoFiles = Object.keys(
  import.meta.glob('../../../public/video/*', { eager: true, query: '?url', import: 'default' }),
).map((path) => path.split('/').pop());

describe('HeroVideo', () => {
  it('renders the video with both sources and its own poster', () => {
    render(<HeroVideo />);
    const video = screen.getByTestId('hero-video');
    expect(video.getAttribute('poster')).toBe('/video/hero-poster.jpg');
    expect(Array.from(video.querySelectorAll('source')).map((s) => s.getAttribute('src'))).toEqual([
      '/video/hero.webm',
      '/video/hero.mp4',
    ]);
  });

  /**
   * vitest/jsdom (not Playwright): the bug this catches — `public/video/hero.{webm,mp4}`
   * sourced by the `<video>` but never actually committed, so every `<source>` 404ed in
   * production and the element silently degraded to the poster image — is a missing static
   * asset, not a browser rendering behaviour. A filesystem-backed check for the files the
   * rendered markup references is the precise, fast layer for that; it needs no real browser
   * to catch a bug that has nothing to do with layout, CSS or video decoding.
   */
  it('ships the files its own <source> and poster attributes reference', () => {
    render(<HeroVideo />);
    const video = screen.getByTestId('hero-video');
    const referenced = [
      video.getAttribute('poster'),
      ...Array.from(video.querySelectorAll('source')).map((s) => s.getAttribute('src')),
    ];

    for (const href of referenced) {
      const basename = (href ?? '').split('/').pop();
      expect(publicVideoFiles, `${href} should exist under public/video/`).toContain(basename);
    }
  });

  it('falls back to the poster image when the sources fail', () => {
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
