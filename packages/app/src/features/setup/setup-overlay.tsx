import { COMMANDS } from '@midnite/studio-shared';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { LuArrowDownRight, LuChevronRight, LuX } from 'react-icons/lu';

import { BrandMark, Wordmark } from '../../components/brand';
import { IconButton } from '../../components/icon-button';
import { ThemeToggle } from '../../components/theme-toggle';
import { useDismiss } from '../../components/use-dismiss';
import { useFocusTrap } from '../../components/use-focus-trap';
import { isFirstRun } from '../../store/setup-state';
import { isCompanionPanelDocked, isFabPanelDocked, useUiStore } from '../../store/ui-store';
import { useTitleTypewriter } from '../slides/use-title-typewriter';
import { chordFor, displayChord } from '../status-bar/chord-hint';
import {
  CHOREO,
  centredRect,
  dissolveTimeline,
  handoffTimeline,
  introTimeline,
  isReducedMotion,
  playGlide,
  playTimeline,
  type HandoffPhase,
  type IntroFrame,
  type RectLike,
} from './setup-choreography';
import {
  dotStates,
  initialStep,
  nextStep,
  prevStep,
  resumePageId,
  type DotState,
  type SetupStep,
} from './setup-machine';
import { SETUP_PAGES } from './setup-pages';
import { useSetupStore } from './setup-store';

const PAGE_IDS = SETUP_PAGES.map((page) => page.id);

/** The word the intro types. Only the brand half of the wordmark: "Studio" is the qualifier. */
const BRAND_WORD = 'Midnite';

/** The intro mark's size in px (`h-16 w-16`) — where a resume's glide starts from. */
const INTRO_MARK_PX = 64;

/**
 * How the step on screen arrived (Theme B).
 *
 * - `mode`: `typed` types the page title and fades its body in once the title
 *   is whole; `instant` shows both at once. Forward moves type; Back, a dot
 *   jump and reduced motion are instant — retyping a title you have already
 *   read, on the way back to it, is waiting rather than choreography.
 * - `glideFrom`: where the brand mark flies into the title anchor from — the
 *   intro mark's rect, `'centre'` when the overlay opened straight onto a
 *   page, `null` when it stays put (every page-to-page move: the anchor is
 *   the frame's, so it does not move between pages at all).
 */
type Arrival = { mode: 'typed' | 'instant'; glideFrom: RectLike | 'centre' | null };
type View = { step: SetupStep; arrival: Arrival };

/** Theme C: the handoff under way, and the FAB it points at (`null`: hidden, so no arrow). */
type Handoff = { phase: HandoffPhase; target: RectLike | null };

/**
 * The full-window setup overlay (Phase 98 Theme A) — the one surface that
 * replaced `FirstRunModal` and `OnboardingModal`, which a fresh profile used
 * to get stacked on top of each other.
 *
 * Open when either something asked for it this session (`setup-store.ts`:
 * the `setup.open` command, Settings ▸ Accounts' "Resume setup") or the
 * persisted gate says this profile has never finished or left setup
 * (`isFirstRun`). The frame is driven entirely by `SETUP_PAGES` — a new page
 * is a row appended there, never a change here.
 *
 * Leaving early is a normal path, not a failure: X, Skip and Escape all
 * record where the user was (`dismissedAt`, `lastPageId`), and Skip also
 * records the page it left in `skippedPageIds`. Theme C turns that exit into
 * the FAB handoff; Theme B adds the brand choreography, which is why the mark
 * is rendered by this frame beside the title rather than by any page.
 */
export function SetupOverlay() {
  const firstRun = useUiStore((s) => isFirstRun(s.setupState));
  const requested = useSetupStore((s) => s.requested);
  const startPageId = useSetupStore((s) => s.startPageId);
  const resume = useSetupStore((s) => s.resume);

  if (!requested && !firstRun) return null;
  // Keyed on the start page, so a second request for a different page while
  // open restarts the frame there instead of being ignored.
  return (
    <SetupFrame
      key={startPageId ?? (resume ? 'resume' : 'intro')}
      startPageId={startPageId}
      resume={resume}
    />
  );
}

function SetupFrame({ startPageId, resume }: { startPageId: string | null; resume: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const introMarkRef = useRef<HTMLSpanElement>(null);
  // Read once per open: a motion preference flipped mid-choreography would
  // otherwise change a timeline's shape halfway through playing it.
  const [reduced] = useState(isReducedMotion);
  const [view, setView] = useState<View>(() => {
    const start = resume
      ? resumePageId(PAGE_IDS, useUiStore.getState().setupState)
      : startPageId;
    const step = initialStep(start, PAGE_IDS);
    // Opened straight onto a page (a resume, a Settings deep link): no intro,
    // but the mark still arrives from the centre into the anchor.
    const glideFrom = step.kind === 'page' && !reduced ? 'centre' : null;
    return { step, arrival: { mode: reduced ? 'instant' : 'typed', glideFrom } };
  });
  const { step, arrival } = view;
  const [typedFor, setTypedFor] = useState<string | null>(null);
  const [introLeaving, setIntroLeaving] = useState(false);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const timers = useRef<{ intro?: ReturnType<typeof setTimeout>; handoff?: () => void }>({});
  const skippedPageIds = useUiStore((s) => s.setupState.skippedPageIds);

  const page = step.kind === 'page' ? SETUP_PAGES[step.index] : undefined;
  const pageCount = SETUP_PAGES.length;

  const go = (next: SetupStep, arrivalNext: Arrival): void => {
    setView({
      step: next,
      arrival: reduced ? { mode: 'instant', glideFrom: null } : arrivalNext,
    });
  };

  useEffect(
    () => () => {
      clearTimeout(timers.current.intro);
      timers.current.handoff?.();
    },
    [],
  );

  // The glide (FLIP): the anchor is already where it belongs in layout, so
  // measure it and play a transform from wherever the mark was. Layout effect,
  // so the first painted frame is the inverted one, not a flash of the end.
  useLayoutEffect(() => {
    const from = arrival.glideFrom;
    const anchor = anchorRef.current;
    if (from === null || !anchor) return;
    const origin =
      from === 'centre'
        ? centredRect(containerRef.current?.getBoundingClientRect() ?? viewportRect(), INTRO_MARK_PX)
        : from;
    playGlide(anchor, origin);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps -- once per arrival, which `view` identifies

  // --- Theme C: the handoff to the FAB ---------------------------------------

  const finish = (): void => {
    timers.current.handoff = undefined;
    useSetupStore.getState().closeSetup();
  };

  const runHandoff = (timeline: ReturnType<typeof handoffTimeline>): void => {
    timers.current.handoff?.();
    timers.current.handoff = playTimeline(timeline, (phase) => {
      if (phase === 'done') finish();
      else setHandoff((current) => (current ? { ...current, phase } : current));
    });
  };

  /** Any click, or Escape, while the hint shows: dissolve now rather than after the beat. */
  const dissolveNow = (): void => {
    if (!handoff || handoff.phase === 'dissolving') return;
    runHandoff(dissolveTimeline(reduced));
  };

  const leave = (skip: boolean): void => {
    if (handoff) return;
    const { updateSetupState, setSetupPageSkipped } = useUiStore.getState();
    if (skip && page) setSetupPageSkipped(page.id, true);
    updateSetupState({ dismissedAt: new Date().toISOString(), lastPageId: page?.id ?? null });
    // `dismissedAt` just closed the first-run gate; stay mounted until the
    // handoff has said where setup went.
    useSetupStore.getState().holdOpen();
    const timeline = handoffTimeline(reduced);
    setHandoff({ phase: timeline[0]!.frame, target: measureFab() });
    // The control that was clicked is about to fade and go inert.
    containerRef.current?.focus({ preventScroll: true });
    runHandoff(timeline);
  };

  const complete = (): void => {
    useUiStore.getState().updateSetupState({ completedAt: new Date().toISOString(), lastPageId: null });
    useSetupStore.getState().closeSetup();
  };

  const canAdvance = page?.canAdvance?.() ?? true;

  /**
   * Intro → page 1: the wordmark fades, then the mark glides from where it
   * sat beside the word into the title anchor. Under reduced motion both are
   * skipped and page 1 is simply there, mark in place.
   */
  const begin = (upcoming: SetupStep): void => {
    if (reduced) {
      go(upcoming, { mode: 'instant', glideFrom: null });
      return;
    }
    if (introLeaving) return;
    setIntroLeaving(true);
    timers.current.intro = setTimeout(() => {
      const rect = introMarkRef.current?.getBoundingClientRect();
      go(upcoming, { mode: 'typed', glideFrom: rect ? toRect(rect) : null });
    }, CHOREO.wordFadeMs);
  };

  const next = (): void => {
    if (!canAdvance || handoff) return;
    const upcoming = nextStep(step, pageCount);
    if (upcoming.kind === 'closed') {
      complete();
      return;
    }
    if (step.kind === 'intro') {
      begin(upcoming);
      return;
    }
    // Continuing is engaging with the page, not skipping it — clears a skip
    // recorded on an earlier visit (Settings ▸ Accounts' "Resume setup" lands
    // back on the page it was recorded for).
    if (page) useUiStore.getState().setSetupPageSkipped(page.id, false);
    go(upcoming, { mode: 'typed', glideFrom: null });
  };

  const back = (): void => {
    if (handoff) return;
    const previous = prevStep(step, pageCount);
    if (previous.kind === 'intro') setIntroLeaving(false);
    go(previous, { mode: 'instant', glideFrom: null });
  };

  // Escape is the X path — or, once the handoff is showing, "go now".
  // `dialog`, blocking — which also registers the occluder that hides the
  // browser's native view; no `useOccluder` as well.
  useDismiss(true, () => (handoff ? dissolveNow() : leave(false)));
  useFocusTrap(containerRef, true);

  // ←/→ step between pages — but never out of a text field, where the arrows
  // move the caret, and never with a modifier held, which is someone else's
  // chord. → on the finale does nothing: finishing is Get started, a click,
  // not a stray arrow. Read through a ref so the listener is installed once.
  const atFinale = step.kind === 'finale';
  const keysRef = useRef({ next, back, atFinale });
  useEffect(() => {
    keysRef.current = { next, back, atFinale };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      if (isEditable(event.target)) return;
      event.preventDefault();
      if (event.key === 'ArrowRight') {
        if (!keysRef.current.atFinale) keysRef.current.next();
      }
      else keysRef.current.back();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const label =
    step.kind === 'page' && page ? page.title : step.kind === 'finale' ? 'Setup complete' : 'Set up Midnite Studio';
  const dots = dotStates(step, PAGE_IDS, skippedPageIds);
  const bodyShown = page !== undefined && (arrival.mode === 'instant' || typedFor === page.id);
  // The page content, faded out and made inert once the handoff starts.
  const content = {
    inert: handoff !== null,
    'aria-hidden': handoff !== null ? true : undefined,
    style: {
      opacity: handoff ? 0 : 1,
      transition: `opacity ${reduced ? 0 : CHOREO.handoffFadeMs}ms ease-in-out`,
    },
  } as const;

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-testid="setup-overlay"
      data-step={step.kind === 'page' && page ? page.id : step.kind}
      data-handoff={handoff?.phase}
      onClick={handoff ? dissolveNow : undefined}
      style={{
        opacity: handoff?.phase === 'dissolving' ? 0 : 1,
        transition: `opacity ${reduced ? 0 : CHOREO.dissolveMs}ms ease-in-out`,
      }}
      className="fixed inset-0 z-dialog flex flex-col bg-background text-foreground outline-none"
    >
      <header {...content} className="flex shrink-0 items-center justify-between px-3 pt-3">
        <IconButton icon={LuX} label="Close setup" onClick={() => leave(false)} />
        <ThemeToggle elevated />
      </header>

      <main {...content} className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6">
        {/*
          Pages sit at a fixed height from the top rather than centred: a
          centred column re-centres whenever its body grows, which would move
          the title anchor as each body faded in and between pages of
          different lengths. The intro and the finale stand alone, so centre.
        */}
        <div
          className={`flex w-full max-w-xl flex-col gap-6 py-8 ${step.kind === 'page' ? 'mt-[14vh]' : 'my-auto'}`}
        >
          {step.kind === 'intro' ? (
            <Intro
              instant={arrival.mode === 'instant'}
              leaving={introLeaving}
              markRef={introMarkRef}
              onBegin={next}
            />
          ) : null}

          {step.kind === 'page' && page ? (
            <>
              <div className="flex items-center gap-3">
                {/*
                  The fixed anchor: rendered by the frame, at the same place
                  in the tree for every page, so it never remounts or moves
                  between pages — only the glide in (intro, resume) and
                  Theme J's finale move it.
                */}
                <span ref={anchorRef} data-testid="setup-title-anchor" className="shrink-0">
                  <BrandMark className="h-8 w-8" />
                </span>
                <PageTitle
                  key={page.id}
                  title={page.titleTyped}
                  instant={arrival.mode === 'instant'}
                  delayMs={arrival.glideFrom !== null ? CHOREO.glideMs : 0}
                  onTyped={() => setTypedFor(page.id)}
                />
              </div>
              {bodyShown ? (
                <div
                  key={page.id}
                  data-testid="setup-page-body"
                  className={arrival.mode === 'typed' ? 'animate-fade-in' : undefined}
                  style={arrival.mode === 'typed' ? { animationDuration: '280ms' } : undefined}
                >
                  <page.Component />
                </div>
              ) : null}
              {/* Arrives with the body, so the buttons do not sit alone under a title still typing. */}
              <div
                className={`flex items-center justify-between gap-2 ${bodyShown && arrival.mode === 'typed' ? 'animate-fade-in' : ''}`}
                style={{
                  visibility: bodyShown ? 'visible' : 'hidden',
                  ...(arrival.mode === 'typed' ? { animationDuration: '280ms' } : {}),
                }}
              >
                <button
                  type="button"
                  onClick={back}
                  className="rounded px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={next}
                  disabled={!canAdvance}
                  className="rounded bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </>
          ) : null}

          {step.kind === 'finale' ? <Finale onBack={back} onDone={complete} /> : null}
        </div>
      </main>

      <footer {...content} className="flex shrink-0 flex-col items-center gap-2 pb-5">
        <ol aria-label="Setup pages" className="flex items-center gap-2">
          {SETUP_PAGES.map((row, index) => (
            <li key={row.id}>
              <button
                type="button"
                aria-label={`${row.title} (page ${index + 1} of ${pageCount})`}
                aria-current={dots[index] === 'active' ? 'step' : undefined}
                data-dot={dots[index]}
                onClick={() => go({ kind: 'page', index }, { mode: 'instant', glideFrom: null })}
                className={`block h-2 rounded-full transition-all ${DOT_CLASS[dots[index] ?? 'upcoming']}`}
              />
            </li>
          ))}
        </ol>
        {step.kind !== 'finale' ? (
          <button
            type="button"
            onClick={() => leave(true)}
            className="flex items-center gap-0.5 rounded px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip
            <LuChevronRight aria-hidden className="h-3.5 w-3.5" />
          </button>
        ) : (
          // Holds Skip's height, so the dots do not drop when it goes.
          <span aria-hidden className="block h-5" />
        )}
      </footer>

      {handoff && handoff.phase !== 'fading' ? <HandoffCue target={handoff.target} /> : null}
    </div>
  );
}

/** Active is a wider pill; done is filled; skipped is a ring; upcoming is faint. */
const DOT_CLASS: Record<DotState, string> = {
  active: 'w-5 bg-primary',
  done: 'w-2 bg-primary/70',
  skipped: 'w-2 border border-muted-foreground/70 bg-transparent',
  upcoming: 'w-2 bg-muted-foreground/30',
};

/**
 * The intro (Theme B): the mark centred with a caret blinking beside it, then
 * "Midnite" typed letter by letter in the brand face with the brand gradient
 * clipped to the glyphs, then the blurb and Begin.
 *
 * The untyped rest of the word is laid out but invisible, so the row is its
 * final width from the first frame: the mark does not creep left as letters
 * arrive, and the gradient spans the whole word rather than re-stretching
 * over each partial one. `leaving` fades everything but the mark, which is
 * what then glides into the page title's anchor.
 */
function Intro({
  instant,
  leaving,
  markRef,
  onBegin,
}: {
  instant: boolean;
  leaving: boolean;
  markRef: RefObject<HTMLSpanElement | null>;
  onBegin: () => void;
}) {
  const [frame, setFrame] = useState<IntroFrame>(() =>
    instant ? { typed: BRAND_WORD, phase: 'ready' } : { typed: '', phase: 'typing' },
  );
  useEffect(() => playTimeline(introTimeline(BRAND_WORD, instant), setFrame), [instant]);

  const ready = frame.phase === 'ready';
  const fade = {
    opacity: leaving ? 0 : 1,
    transition: `opacity ${CHOREO.wordFadeMs}ms ease-in-out`,
  };

  return (
    <div data-testid="setup-intro" data-intro={frame.phase} className="flex flex-col items-center gap-6 text-center">
      <div className="flex items-center gap-4">
        <span ref={markRef} className="shrink-0">
          <BrandMark className="h-16 w-16" />
        </span>
        <span className="font-brand text-5xl leading-none tracking-wide" style={fade}>
          <span className="sr-only">{BRAND_WORD}</span>
          <span aria-hidden data-testid="setup-intro-word" className="setup-brand-gradient">
            {frame.typed}
            <Caret />
            <span className="invisible">{BRAND_WORD.slice(frame.typed.length)}</span>
          </span>
        </span>
      </div>
      <div
        className={`flex flex-col items-center gap-4 ${ready && !instant ? 'animate-fade-in' : ''}`}
        style={{ ...fade, visibility: ready ? 'visible' : 'hidden' }}
      >
        <p className="max-w-sm text-sm text-muted-foreground">
          A few minutes to get this Mac ready: git, your forges and accounts, and the tools agents
          lean on. Every page is optional.
        </p>
        <button
          type="button"
          onClick={onBegin}
          className="rounded bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Begin setup
        </button>
      </div>
    </div>
  );
}

/**
 * A page title, typed (Theme B) — `useTitleTypewriter`, held back by
 * `delayMs` while the mark is still gliding in beside it. The caret parks at
 * the end once it is whole. The full title is always in the accessible text;
 * only the painted copy is partial.
 */
function PageTitle({
  title,
  instant,
  delayMs,
  onTyped,
}: {
  title: string;
  instant: boolean;
  delayMs: number;
  onTyped: () => void;
}) {
  const { typed, done } = useTitleTypewriter(title, instant, delayMs);
  const onTypedRef = useRef(onTyped);
  useEffect(() => {
    onTypedRef.current = onTyped;
  });
  useEffect(() => {
    if (done) onTypedRef.current();
  }, [done]);

  return (
    <h1 className="text-xl font-semibold tracking-tight" data-typed={done ? 'done' : 'typing'}>
      <span className="sr-only">{title}</span>
      <span aria-hidden data-testid="setup-page-title">
        {typed}
        <Caret />
      </span>
    </h1>
  );
}

/**
 * The typing caret — the terminal's `caret-blink`, reused. Its reduced-motion
 * guard (`.setup-caret` in `styles.css`) removes the animation outright, so it
 * holds solid rather than being pinned to the keyframe's invisible last frame.
 */
function Caret() {
  return (
    <span
      aria-hidden
      className="setup-caret ml-[0.08em] inline-block h-[0.9em] w-[2px] translate-y-[0.1em] animate-caret-blink rounded-[1px] bg-foreground/70"
    />
  );
}

/**
 * Theme C: what the overlay leaves on screen after X or Skip — a stand-in for
 * the FAB exactly over the real one (which is behind the overlay, and is what
 * shows through once it dissolves), the hint, and an arrow nudging at it.
 * With the FAB hidden (a docked panel took its place) there is nothing to
 * point at, so the hint names the palette command instead and no arrow shows.
 */
function HandoffCue({ target }: { target: RectLike | null }) {
  if (target === null) {
    const chord = displayChord(chordFor('palette.open', 'Mod+k'));
    const command = COMMANDS.find((c) => c.id === 'setup.open')?.label ?? 'Run Setup Wizard';
    return (
      <div
        data-testid="setup-handoff-cue"
        className="fixed bottom-8 right-8 max-w-xs animate-fade-in text-right"
      >
        <p role="status" className="text-sm text-foreground">
          You can always continue setup from the command palette: press{' '}
          <kbd className="rounded border border-border px-1 font-mono text-xs">{chord}</kbd> and
          choose “{command}”.
        </p>
      </div>
    );
  }

  const root = document.documentElement;
  const gap = 6;
  return (
    <>
      <div
        aria-hidden
        data-testid="setup-handoff-fab"
        className="fixed flex animate-fade-in items-center justify-center rounded-full bg-primary shadow-lg"
        style={{
          left: target.left,
          top: target.top,
          width: target.width,
          height: target.height,
          animationDuration: '320ms',
        }}
      >
        <BrandMark className="h-full w-full" />
      </div>
      <div
        data-testid="setup-handoff-cue"
        className="fixed flex animate-fade-in flex-col items-end gap-1"
        style={{
          right: root.clientWidth - target.left + gap,
          bottom: root.clientHeight - target.top + gap,
        }}
      >
        <p role="status" className="whitespace-nowrap text-right text-sm font-medium text-foreground">
          You can always continue setup from here
        </p>
        <span aria-hidden data-testid="setup-handoff-arrow" className="setup-handoff-arrow inline-block text-primary">
          <LuArrowDownRight className="h-10 w-10" />
        </span>
      </div>
    </>
  );
}

/**
 * The FAB's box, or `null` when it is not on screen: hidden while either
 * docked panel holds its corner (`app.tsx` renders it only when neither is),
 * and not measurable when it is absent from the DOM altogether.
 */
function measureFab(): RectLike | null {
  const state = useUiStore.getState();
  if (isFabPanelDocked(state) || isCompanionPanelDocked(state)) return null;
  const fab = document.querySelector<HTMLElement>('[data-testid="fab-button"]');
  const rect = fab?.getBoundingClientRect();
  return rect && rect.width > 0 ? toRect(rect) : null;
}

function toRect(rect: DOMRect): RectLike {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/** The viewport, as a rect — the fallback centre when the container is not measurable. */
function viewportRect(): RectLike {
  return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

/** Static until Theme J adds the completion transition. */
function Finale({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h1 className="flex flex-wrap items-center justify-center gap-2 text-2xl font-semibold">
        <span>Welcome to</span>
        <BrandMark className="h-8 w-8" />
        <Wordmark />
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        You can run setup again any time from the command palette.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Get started
        </button>
      </div>
    </div>
  );
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
