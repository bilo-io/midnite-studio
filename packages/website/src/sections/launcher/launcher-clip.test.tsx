import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setTheme } from '../../theme';

import { LauncherClip } from './launcher-clip';

afterEach(() => {
  setTheme('system');
  vi.restoreAllMocks();
});

const shipped = (glob: Record<string, unknown>) => Object.keys(glob).map((p) => p.split('/').pop());
const videos = shipped(import.meta.glob('../../../public/video/*', { eager: true, query: '?url', import: 'default' }));
const images = shipped(
  import.meta.glob('../../../public/img/launcher/*', { eager: true, query: '?url', import: 'default' }),
);

const sourceOf = (el: HTMLElement) => el.querySelector('source')?.getAttribute('src');

describe('LauncherClip', () => {
  it('plays the dark take by default, with the dark still as its poster', () => {
    render(<LauncherClip />);
    const video = screen.getByTestId('launcher-clip');
    expect(sourceOf(video)).toBe('/video/launcher-dark.mp4');
    expect(video.getAttribute('poster')).toBe('/img/launcher/launcher-dark.jpg');
  });

  it('switches to the light take when the theme resolves to light', () => {
    setTheme('light');
    render(<LauncherClip />);
    const video = screen.getByTestId('launcher-clip');
    expect(sourceOf(video)).toBe('/video/launcher-light.mp4');
    expect(video.getAttribute('poster')).toBe('/img/launcher/launcher-light.jpg');
  });

  it('shows the still, not the loop, under reduced motion', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('reduced-motion'),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    render(<LauncherClip />);
    expect(screen.queryByTestId('launcher-clip')).toBeNull();
    expect(screen.getByTestId('launcher-still').getAttribute('src')).toBe('/img/launcher/launcher-dark.jpg');
  });

  it('falls back to the still when the clip fails', () => {
    render(<LauncherClip />);
    fireEvent.error(screen.getByTestId('launcher-clip'));
    expect(screen.getByTestId('launcher-still')).toBeTruthy();
  });

  /** vitest, not Playwright: a missing committed asset is a filesystem fact, not a rendering one. */
  it('ships every clip and still it references, in both themes', () => {
    for (const theme of ['dark', 'light'] as const) {
      expect(videos).toContain(`launcher-${theme}.mp4`);
      expect(images).toContain(`launcher-${theme}.jpg`);
    }
  });
});
