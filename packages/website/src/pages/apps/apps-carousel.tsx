import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';

import { appLogoHref, spectrumVars, type SiteApp } from '../../apps/catalog';
import { useReducedMotion } from '../../hooks/use-reduced-motion';
import type { VersionState } from '../use-latest-version';

import { AppHero } from './app-hero';

export type AppsCarouselProps = {
  apps: readonly SiteApp[];
  /** The slide in view. Owned by the page, which tints itself to match. */
  active: number;
  onActiveChange: (index: number) => void;
  version: VersionState;
};

/** How much of a slide must be in the track's viewport before it counts as the one in view. */
const IN_VIEW = 0.6;

/** The longest a programmatic scroll may hold the active slide before the observer takes over again. */
const SCROLL_LOCK_MS = 1200;

/**
 * The Apps page's carousel: one hero per app, side by side.
 *
 * **The browser does the scrolling.** The track is a horizontal scroller with
 * CSS snap (`.ws-carousel-track`), so a swipe on a phone, a trackpad flick and
 * the keyboard all move it natively, with the platform's own momentum. The
 * arrows, the thumbnails and the arrow keys only call `scrollTo`. An
 * `IntersectionObserver` rooted on the track decides which slide is in view and
 * reports it up, and that index is what plays the slide's cascade
 * (`data-active`) and tints the page.
 *
 * **A programmatic scroll holds the target.** Smooth-scrolling from the first
 * slide to the ninth passes the seven between, and without a hold each would
 * become active for a frame and start its cascade. So a jump records its target
 * and the observer ignores every other slide until the target arrives (or
 * `SCROLL_LOCK_MS` passes, if something interrupts the scroll).
 *
 * **The fragment follows the slide**, by `replaceState` so it adds no history
 * entry per swipe: `/apps/#coder` is a link to Coder's slide, and opening it
 * lands there without animating past the others.
 *
 * Accessibility follows the WAI carousel pattern: a labelled region with
 * `aria-roledescription="carousel"`, each slide a labelled group, the
 * thumbnails a set of buttons marking the current one, and the inactive slides
 * `inert` so tab order stays on the slide being read.
 */
export const AppsCarousel = ({ apps, active, onActiveChange, version }: AppsCarouselProps) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lockRef = useRef<{ target: number; until: number } | null>(null);
  const reduced = useReducedMotion();

  /** Centre slide `index` in the track. `instant` for the first paint and reduced motion. */
  const scrollToSlide = useCallback(
    (index: number, instant = false) => {
      const track = trackRef.current;
      const slide = slideRefs.current[index];
      if (!track || !slide) return;
      const left = slide.offsetLeft - (track.clientWidth - slide.clientWidth) / 2;
      lockRef.current = { target: index, until: Date.now() + SCROLL_LOCK_MS };
      if (typeof track.scrollTo === 'function') {
        track.scrollTo({ left, behavior: instant || reduced ? 'auto' : 'smooth' });
      } else {
        track.scrollLeft = left;
      }
    },
    [reduced],
  );

  const go = useCallback(
    (index: number) => {
      const next = Math.max(0, Math.min(apps.length - 1, index));
      onActiveChange(next);
      scrollToSlide(next);
    },
    [apps.length, onActiveChange, scrollToSlide],
  );

  // First paint: land on the slide the page opened with (a `#coder` link), with
  // no animation past the ones before it.
  useLayoutEffect(() => {
    scrollToSlide(active, true);
    // Only on mount: later changes come from the observer or from `go`, both
    // of which have already scrolled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Which slide is in view.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < IN_VIEW) continue;
          const index = slideRefs.current.indexOf(entry.target as HTMLDivElement);
          if (index === -1) continue;
          const lock = lockRef.current;
          if (lock && Date.now() < lock.until && index !== lock.target) continue;
          if (lock && index === lock.target) lockRef.current = null;
          onActiveChange(index);
        }
      },
      { root: track, threshold: [IN_VIEW] },
    );
    for (const slide of slideRefs.current) if (slide) observer.observe(slide);
    return () => observer.disconnect();
  }, [onActiveChange]);

  // The fragment, and the thumbnail strip, follow the active slide.
  useEffect(() => {
    const app = apps[active];
    if (!app) return;
    if (typeof window !== 'undefined' && window.location.hash !== `#${app.id}`) {
      window.history.replaceState(null, '', `#${app.id}`);
    }
    const strip = stripRef.current;
    const thumb = thumbRefs.current[active];
    if (strip && thumb && typeof strip.scrollTo === 'function') {
      strip.scrollTo({
        left: thumb.offsetLeft - (strip.clientWidth - thumb.clientWidth) / 2,
        behavior: reduced ? 'auto' : 'smooth',
      });
    }
  }, [active, apps, reduced]);

  // A fragment changed from outside (a link to `#gamer` elsewhere on the page).
  useEffect(() => {
    const onHashChange = () => {
      const index = apps.findIndex((app) => `#${app.id}` === window.location.hash);
      if (index !== -1) go(index);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [apps, go]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const keys: Record<string, number> = {
      ArrowRight: active + 1,
      ArrowLeft: active - 1,
      Home: 0,
      End: apps.length - 1,
    };
    const target = keys[event.key];
    if (target === undefined) return;
    event.preventDefault();
    go(target);
  };

  const current = apps[active];

  return (
    <section
      aria-roledescription="carousel"
      aria-label="The midnite apps"
      onKeyDown={onKeyDown}
      className="relative"
    >
      <div ref={trackRef} className="ws-carousel-track pb-6 pt-2">
        {apps.map((app, index) => (
          <div
            key={app.id}
            id={app.id}
            ref={(el) => {
              slideRefs.current[index] = el;
            }}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${apps.length}: Midnite ${app.name}`}
            data-active={index === active ? 'true' : 'false'}
            className="ws-app-slide"
          >
            <AppHero app={app} version={version} active={index === active} />
          </div>
        ))}
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-5 sm:px-8">
        <div className="flex w-full items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => go(active - 1)}
            disabled={active === 0}
            aria-label="Previous app"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line-strong bg-bg-elevated/70 text-fg backdrop-blur transition duration-base hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <LuChevronLeft aria-hidden="true" />
          </button>

          {/* The live readout: which app, out of how many. Polite, so a swipe is announced without interrupting. */}
          <p aria-live="polite" className="text-center text-sm text-fg-muted">
            <span className="font-mono text-fg">{String(active + 1).padStart(2, '0')}</span>
            <span className="mx-1.5 text-fg-subtle">/</span>
            <span className="font-mono">{String(apps.length).padStart(2, '0')}</span>
            <span className="ml-3 font-medium text-fg">{current ? `Midnite ${current.name}` : ''}</span>
          </p>

          <button
            type="button"
            onClick={() => go(active + 1)}
            disabled={active === apps.length - 1}
            aria-label="Next app"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line-strong bg-bg-elevated/70 text-fg backdrop-blur transition duration-base hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <LuChevronRight aria-hidden="true" />
          </button>
        </div>

        <div
          ref={stripRef}
          className="ws-thumb-strip -mx-5 flex w-[calc(100%+2.5rem)] gap-3 overflow-x-auto px-5 py-3 sm:mx-0 sm:w-full sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0"
          role="group"
          aria-label="Choose an app"
        >
          {apps.map((app, index) => (
            <button
              key={app.id}
              ref={(el) => {
                thumbRefs.current[index] = el;
              }}
              type="button"
              onClick={() => go(index)}
              aria-label={`Show Midnite ${app.name}`}
              aria-current={index === active ? 'true' : undefined}
              title={`Midnite ${app.name}`}
              className="ws-thumb shrink-0 rounded-[0.9rem]"
              style={spectrumVars(app.spectrum) as CSSProperties}
            >
              <img
                src={appLogoHref(app.id)}
                alt=""
                width={48}
                height={48}
                draggable={false}
                className="h-11 w-11 select-none rounded-[0.9rem] sm:h-12 sm:w-12"
              />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};
