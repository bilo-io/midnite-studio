import { useEffect, useRef, useState } from 'react';

import { useReducedMotion } from '../../components';
import { assetHref } from '../../routes';
import { useResolvedTheme } from '../../theme';

const CLIP = { dark: 'video/launcher-dark.mp4', light: 'video/launcher-light.mp4' } as const;
const STILL = { dark: 'img/launcher/launcher-dark.jpg', light: 'img/launcher/launcher-light.jpg' } as const;

const LABEL =
  'The Midnyte Apps launcher: a grid of app tiles, scrolled, with one app’s details panel opened and closed again.';

/**
 * The launcher itself, in the theme the page is in: a ten-second silent loop
 * (scroll the grid, open Gamer's details panel, close it, scroll back) whose
 * poster is its own first frame.
 *
 * A dark and a light take, picked by `useResolvedTheme()` for the reason
 * `HeroVideo` gives: the nav's toggle can override the OS, and a `<picture
 * media>` source cannot hear that. `key={theme}` remounts the element on a
 * toggle, because swapping a `<source>` under a playing `<video>` does
 * nothing until `load()`.
 *
 * Reduced motion gets the still, never the loop; so does a clip that fails to
 * load. `.play()` is called explicitly for the muted-autoplay reason in
 * `hero-video.tsx`. Both clips are recorded from the launcher's renderer on
 * its mock bridge: see `VIDEO.md`.
 */
export const LauncherClip = ({ className = '' }: { className?: string }) => {
  const theme = useResolvedTheme();
  const reducedMotion = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const frame = `block w-full overflow-hidden rounded-lg border border-line bg-bg-sunken shadow-glow-soft ${className}`;
  const still = assetHref(STILL[theme]);

  useEffect(() => {
    try {
      videoRef.current?.play()?.catch(() => {});
    } catch {
      // jsdom has no media pipeline.
    }
  }, [failed, theme, reducedMotion]);

  if (failed || reducedMotion) {
    return (
      <img
        data-testid="launcher-still"
        src={still}
        alt={LABEL}
        width={1920}
        height={1230}
        className={`h-auto ${frame}`}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <video
      key={theme}
      ref={(node) => {
        videoRef.current = node;
        node?.setAttribute('muted', '');
      }}
      data-testid="launcher-clip"
      className={`aspect-[1920/1230] ${frame}`}
      poster={still}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
      aria-label={LABEL}
    >
      <source src={assetHref(CLIP[theme])} type="video/mp4" onError={() => setFailed(true)} />
    </video>
  );
};
