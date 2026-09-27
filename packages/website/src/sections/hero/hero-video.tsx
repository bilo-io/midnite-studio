import { useEffect, useRef, useState } from 'react';

import { assetHref } from '../../routes';
import { useResolvedTheme } from '../../theme';

export type HeroVideoProps = { className?: string };

const POSTER = 'img/app-showcase/multi-screen-horizontal-dark.png';
const POSTER_LIGHT = 'img/app-showcase/multi-screen-horizontal-light.png';

/** The video's own poster — its first frame, so starting playback never flashes. */
const VIDEO_POSTER = 'video/hero-poster.jpg';

/**
 * The product clip, and the poster it degrades to.
 *
 * `public/video/hero.{webm,mp4}` **is committed** — see `public/video/README.md`
 * for the source and the encode commands. It was not always: this element
 * shipped for a while with an empty `public/video/`, so every visitor silently
 * got the `error`-triggered fallback below instead of a video, which is what
 * this component still has to degrade to gracefully whenever the clip is
 * unavailable for any reason (a bad deploy, a host serving the wrong
 * content-type, …) — the `error` listener stays, on purpose, as the permanent
 * feature it always was, not a workaround for the asset's past absence. When
 * both `<source>`s fail the video element is unmounted and an `<img>` of the
 * app screenshot takes its place, at the same size, so nothing in the layout
 * moves.
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

  /**
   * React's `muted` JSX prop sets the element's `muted` **property**, never
   * the `muted` **content attribute** — confirmed with Playwright/Chromium:
   * `hasAttribute('muted')` reads `false` even though `video.muted` reads
   * `true`. That would be harmless on its own (the attribute is only the
   * default at parse time; the property is what actually mutes the audio),
   * except that Chromium's un-gestured-`autoplay` decision runs once, at the
   * moment the `<video>` is connected with its sources resolved, and reads
   * `muted` as it stands *then* — React inserts the whole subtree in one
   * commit with `autoplay` already set but `muted` still `false` (the ref
   * callback that would flip it fires a tick later, after that decision has
   * already been made and denied). The upshot: the element loads fine
   * (`readyState` reaches 4, no `error`) and then just sits on its poster
   * frame forever — no error, no console warning, nothing short of checking
   * `.paused` to see it. An identical static-HTML `<video>` with a literal
   * `muted` attribute present at parse time autoplays immediately in the same
   * browser. Setting the attribute via a ref (below) does not fix this by
   * itself, for the same reason; what actually works is not depending on the
   * browser's own autoplay heuristic at all — an explicit `.play()` once the
   * element has mounted always succeeds for a muted element, gesture or not.
   */
  const setVideoRef = (node: HTMLVideoElement | null) => {
    videoRef.current = node;
    node?.setAttribute('muted', '');
  };

  useEffect(() => {
    try {
      // jsdom (vitest) has no media pipeline: `.play()` throws synchronously
      // there (`Not implemented: HTMLMediaElement.prototype.play`) rather
      // than returning a rejecting promise the way a real browser does when
      // it refuses playback, so both paths need a catch.
      videoRef.current?.play()?.catch(() => {
        // Playback can still be refused in an unusual environment (no
        // user-activation credit left in a test harness, a policy override);
        // the poster stays visible either way, which is the fallback this
        // already degrades to on a hard `error`.
      });
    } catch {
      // See above — jsdom only.
    }
  }, [failed]);

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
      ref={setVideoRef}
      data-testid="hero-video"
      className={`block h-full w-full object-cover ${frame}`}
      poster={assetHref(VIDEO_POSTER)}
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
