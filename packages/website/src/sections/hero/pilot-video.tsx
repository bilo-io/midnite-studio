import { useRef, useState } from 'react';
import { LuPlay } from 'react-icons/lu';

import { GlowCard } from '../../components';
import { assetHref } from '../../routes';

export type PilotVideoProps = { className?: string };

const POSTER = 'video/pilot-intro-poster.jpg';

/**
 * The pilot: a framed, click-to-play clip beside the hero copy.
 *
 * This is **not** `HeroVideo` — that component is a muted, looping backdrop
 * clip of the app itself (`video/hero.{webm,mp4}`, still unrecorded — see its
 * own file), rendered full-width below the fold of this same section.
 * `PilotVideo` is a different thing entirely: a narrated introduction with a
 * named voice, which means it needs audio, needs a visitor's explicit consent
 * to start it, and needs to be *seen* as a control rather than as scenery. So
 * it gets its own component rather than a mode flag on `HeroVideo` — the two
 * never share a code path, and a change to one's autoplay/mute behaviour must
 * never leak into the other's.
 *
 * **Click-to-play, not autoplay.** `preload="none"` on the `<video>` means
 * nothing downloads until the visitor commits, and the element carries no
 * `autoPlay` — the overlay button is the only thing that ever starts playback,
 * by calling `.play()` from inside its own click handler, which is what keeps
 * the browser's autoplay-with-sound policy satisfied without relying on
 * whichever leniency window a deferred `autoPlay` attribute might get after a
 * state update. The overlay unmounts once playback has started, handing the
 * rest of the session to the native `controls` — this is the one place on the
 * site the convention "every icon is `react-icons`" meets a control that is
 * otherwise entirely native.
 *
 * **Framed with `GlowCard`**, the same accent glow the early-access card and
 * the download page's command box wear, so the player reads as a control
 * embedded in the page rather than an embed some other tool dropped in.
 *
 * Nothing here animates on its own — the only transitions are the hover states
 * on the play button, on the shared `duration-base` token that `tokens.css`
 * zeroes under `prefers-reduced-motion`, so there is no separate reduced-motion
 * branch to maintain.
 */
export const PilotVideo = ({ className = '' }: PilotVideoProps) => {
  const [started, setStarted] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const start = () => {
    setStarted(true);
    videoRef.current?.play().catch(() => {
      /* Playback can still be refused (e.g. no user-activation credit left in
         a test environment); the native controls remain visible either way. */
    });
  };

  return (
    <GlowCard bare glow="accent" className={`relative aspect-video w-full ${className}`}>
      <video
        ref={videoRef}
        data-testid="pilot-video"
        className="block h-full w-full object-cover"
        controls
        preload="none"
        poster={assetHref(POSTER)}
        aria-label="Damion introduces Midnite Studio: a narrated walkthrough of the commit graph, the terminal and the docked browser, with sound."
      >
        <source src={assetHref('video/pilot-intro.webm')} type="video/webm" />
        <source src={assetHref('video/pilot-intro.mp4')} type="video/mp4" />
      </video>

      {started ? null : (
        <button
          type="button"
          onClick={start}
          data-testid="pilot-video-play"
          aria-label="Play the introduction video"
          className="group absolute inset-0 flex items-center justify-center bg-black/10 transition duration-base hover:bg-black/25"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bg-elevated/90 shadow-glow-soft transition duration-base group-hover:scale-105 sm:h-16 sm:w-16">
            <LuPlay aria-hidden="true" className="ml-1 h-5 w-5 text-fg sm:h-6 sm:w-6" />
          </span>
        </button>
      )}
    </GlowCard>
  );
};
