import { useRef, useState } from 'react';

import { assetHref } from '../../routes';
import { useResolvedTheme } from '../../theme';

export type HeroVideoProps = { className?: string };

const POSTER = 'img/app-showcase/multi-screen-horizontal-dark.png';
const POSTER_LIGHT = 'img/app-showcase/multi-screen-horizontal-light.png';

/**
 * The product clip, and the poster it degrades to.
 *
 * `public/video/hero.{webm,mp4}` is **not committed** — see
 * `public/video/README.md`. That is not a temporary state to be tidied up
 * later: a screen recording is a large binary that does not belong in a git
 * history, and a checkout without one has to look finished rather than broken.
 * So the `error` listener is the real feature here. When both `<source>`s fail
 * the video element is unmounted and an `<img>` of the same screenshot takes
 * its place, at the same size, and nothing in the layout moves.
 *
 * Why an `<img>` rather than leaving the `poster` attribute to do the job: a
 * `<video>` whose sources 404 keeps its poster in Chrome but shows a broken
 * control strip in some engines, and cannot be told to `object-fit` reliably
 * across them. An image is an image.
 *
 * The two screenshots are the dark and light showcase renders. Picking
 * between them reads `useResolvedTheme()` rather than a `<picture media>`
 * source, because the nav's theme toggle can override the OS — a bare
 * `prefers-color-scheme` source has no way to hear that override, only
 * `useResolvedTheme()`'s `system` branch does.
 * `autoplay muted loop playsinline` is the only combination browsers will
 * start without a gesture, and `muted` is not negotiable for that reason.
 */
export const HeroVideo = ({ className = '' }: HeroVideoProps) => {
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const theme = useResolvedTheme();

  const frame = `overflow-hidden rounded-lg bg-bg-sunken shadow-glow-soft ${className}`;

  if (failed) {
    return (
      <picture className={frame} data-testid="hero-poster">
        <img
          src={assetHref(theme === 'light' ? POSTER_LIGHT : POSTER)}
          alt="Midnite Studio: the commit graph, the worktree sidebar and the integrated terminal in one window."
          className="block h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      </picture>
    );
  }

  return (
    <video
      ref={videoRef}
      data-testid="hero-video"
      className={`block h-full w-full object-cover ${frame}`}
      poster={assetHref(POSTER)}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      // Fires on the element when no source could be used, which is the case
      // that matters: an empty `public/video/`.
      onError={() => setFailed(true)}
      aria-label="Midnite Studio in use: the commit graph, the worktree sidebar and the integrated terminal."
    >
      <source src={assetHref('video/hero.webm')} type="video/webm" onError={() => setFailed(true)} />
      <source src={assetHref('video/hero.mp4')} type="video/mp4" onError={() => setFailed(true)} />
    </video>
  );
};
