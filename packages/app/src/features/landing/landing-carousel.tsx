import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import { useAppearanceStore } from '../../store/appearance-store';

/**
 * The landing page's centre carousel — wraparound, animated, and pausable.
 *
 * ### Why a state machine rather than a CSS scroller
 *
 * A horizontal scroll container with `scroll-snap` is the cheap way to build
 * a carousel, and it cannot do two of the things asked for here: fade *to
 * and from transparent* across the change (a scroller shows both slides at
 * full opacity the whole way), and wrap from the last slide to the first
 * without a visible jump back through every slide in between. So this is a
 * two-phase machine — the outgoing slide leaves, then the incoming one
 * arrives — and the index arithmetic is modular, which is what makes the wrap
 * cost exactly what any other step costs.
 *
 * ### Why timers and not `animationend`
 *
 * The motion itself is CSS (`.landing-slide-out` / `.landing-slide-in` in
 * `styles.css`, where the overshoot curve that gives the settle its bounce
 * lives). The *machine* is driven by `setTimeout` on the same durations,
 * because `animationend` never fires under jsdom — the suite would have to
 * dispatch synthetic animation events to test a transition, which tests the
 * test rather than the page. The two are kept in step by the constants below
 * being the single source of both (CSS reads them as inline custom
 * properties).
 */

/** The outgoing slide's fade-out, in ms. Short: it is dead time. */
const OUT_MS = 170;
/** The incoming slide's arrival, in ms — long enough for the overshoot to read. */
const IN_MS = 420;
/** How far a slide travels, in px. Enough to read as motion, not as a scroll. */
const TRAVEL = 36;
/** Idle dwell before the carousel advances itself. */
const AUTOPLAY_MS = 8000;

type Phase =
  | { kind: 'idle' }
  | { kind: 'out'; dir: 1 | -1; to: number }
  | { kind: 'in'; dir: 1 | -1 };

export type CarouselSlide = {
  /** Stable key, and what the dot's accessible name is built from. */
  key: string;
  label: string;
  render: (active: boolean) => ReactNode;
};

/**
 * Whether a keystroke on `window` is the page's to act on.
 *
 * The carousel's arrow keys are bound on `window` rather than on a focused
 * element, because the page has nothing a user would think to click first —
 * and the repositories panel is still mounted beside it, as is any terminal
 * the user left open. Both use the arrow keys for their own navigation, and
 * a text field always does.
 */
function ownsArrowKeys(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return false;
  if (target.closest('.xterm, [role="tree"], [role="grid"], [role="listbox"]')) return false;
  return true;
}

export function LandingCarousel({ slides }: { slides: readonly CarouselSlide[] }) {
  const reduced = useAppearanceStore((s) => s.motion) === 'reduced';
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  /**
   * Autoplay is a hint for someone who has not touched the page, not a
   * behaviour. The first deliberate move — a dot, an arrow key, a swipe —
   * retires it for the rest of the session: a page that keeps moving under
   * a reader who has chosen a slide is a page fighting its user.
   */
  const [interacted, setInteracted] = useState(false);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const count = slides.length;

  /** Modular by construction — wraparound is not a special case here. */
  const goTo = useCallback(
    (next: number, dir: 1 | -1) => {
      const to = ((next % count) + count) % count;
      if (to === index) return;
      clearTimers();
      if (reduced) {
        setIndex(to);
        setPhase({ kind: 'idle' });
        return;
      }
      setPhase({ kind: 'out', dir, to });
      timers.current.push(
        setTimeout(() => {
          setIndex(to);
          setPhase({ kind: 'in', dir });
          timers.current.push(setTimeout(() => setPhase({ kind: 'idle' }), IN_MS));
        }, OUT_MS),
      );
    },
    [clearTimers, count, index, reduced],
  );

  const step = useCallback(
    (dir: 1 | -1) => goTo(index + dir, dir),
    [goTo, index],
  );

  const nudge = useCallback(
    (dir: 1 | -1) => {
      setInteracted(true);
      step(dir);
    },
    [step],
  );

  // Autoplay, until the first interaction. Re-armed per slide, so a manual
  // move never leaves a half-elapsed timer behind.
  useEffect(() => {
    if (interacted || reduced || count < 2) return;
    const id = setTimeout(() => step(1), AUTOPLAY_MS);
    return () => clearTimeout(id);
  }, [interacted, reduced, count, index, step]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!ownsArrowKeys(event.target)) return;
      event.preventDefault();
      nudge(event.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nudge]);

  /**
   * A trackpad's horizontal swipe, with a cooldown.
   *
   * A single two-finger flick emits a burst of `wheel` events, so without the
   * cooldown one gesture would walk several slides at once. The threshold
   * keeps a mostly-vertical scroll (`deltaY` dominant) from counting as a
   * sideways intent at all.
   */
  const wheelLock = useRef(0);
  const onWheel = useCallback(
    (event: { deltaX: number; deltaY: number }): void => {
      if (Math.abs(event.deltaX) < 24 || Math.abs(event.deltaX) < Math.abs(event.deltaY)) return;
      const now = Date.now();
      if (now - wheelLock.current < OUT_MS + IN_MS) return;
      wheelLock.current = now;
      nudge(event.deltaX > 0 ? 1 : -1);
    },
    [nudge],
  );

  const slide = slides[index];

  const stageClass =
    phase.kind === 'out'
      ? 'landing-slide-out'
      : phase.kind === 'in'
        ? 'landing-slide-in'
        : '';
  const dir = phase.kind === 'idle' ? 1 : phase.dir;
  const stageStyle = {
    '--landing-out-x': `${-dir * TRAVEL}px`,
    '--landing-in-x': `${dir * TRAVEL}px`,
    '--landing-out-ms': `${OUT_MS}ms`,
    '--landing-in-ms': `${IN_MS}ms`,
  } as CSSProperties;

  return (
    <div
      data-testid="landing-carousel"
      className="relative z-10 flex min-h-0 w-full flex-1 flex-col items-center justify-center"
      onWheel={onWheel}
    >
      {/*
        A real `tabpanel`, wired to the selected dot by id — not an
        `aria-live` region, which is what this was first written as. The
        first slide's typewriter rewrites its heading every 65ms, and a live
        region would have narrated the word one character at a time, forever.
        The tab/panel relationship announces the slide once, when the reader
        changes it.
      */}
      <div
        key={slide?.key}
        role="tabpanel"
        id="landing-panel"
        aria-labelledby={`landing-tab-${index}`}
        data-testid="landing-slide"
        data-landing-phase={phase.kind}
        className={`flex flex-col items-center text-center ${stageClass}`}
        style={stageStyle}
      >
        {slide?.render(phase.kind === 'idle')}
      </div>

      {/*
        The dots are pinned to the bottom of the page, outside the animating
        stage — they are the one thing that must not move while the content
        does, because they are what tells you where the movement went.
      */}
      <div
        role="tablist"
        aria-label="Landing page sections"
        className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2"
      >
        {slides.map((s, i) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            id={`landing-tab-${i}`}
            aria-controls="landing-panel"
            aria-selected={i === index}
            aria-label={s.label}
            title={s.label}
            /* Roving tabindex, as a tablist owes: Tab reaches the selected
               dot, and the arrow keys move between them. */
            tabIndex={i === index ? 0 : -1}
            data-testid={`landing-dot-${i}`}
            onClick={() => {
              setInteracted(true);
              goTo(i, i > index ? 1 : -1);
            }}
            className={`h-1.5 rounded-full transition-all duration-300 ease-in-out ${
              i === index
                ? 'w-6 bg-foreground/80'
                : 'w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/70'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
