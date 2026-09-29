import { useEffect, useRef, useState } from 'react';
import { LuChevronRight, LuX } from 'react-icons/lu';

import { BrandMark, Wordmark } from '../../components/brand';
import { IconButton } from '../../components/icon-button';
import { ThemeToggle } from '../../components/theme-toggle';
import { useDismiss } from '../../components/use-dismiss';
import { useFocusTrap } from '../../components/use-focus-trap';
import { isFirstRun } from '../../store/setup-state';
import { useUiStore } from '../../store/ui-store';
import {
  dotStates,
  initialStep,
  nextStep,
  prevStep,
  type DotState,
  type SetupStep,
} from './setup-machine';
import { SETUP_PAGES } from './setup-pages';
import { useSetupStore } from './setup-store';

const PAGE_IDS = SETUP_PAGES.map((page) => page.id);

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

  if (!requested && !firstRun) return null;
  // Keyed on the start page, so a second request for a different page while
  // open restarts the frame there instead of being ignored.
  return <SetupFrame key={startPageId ?? 'intro'} startPageId={startPageId} />;
}

function SetupFrame({ startPageId }: { startPageId: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<SetupStep>(() => initialStep(startPageId, PAGE_IDS));
  const skippedPageIds = useUiStore((s) => s.setupState.skippedPageIds);

  const page = step.kind === 'page' ? SETUP_PAGES[step.index] : undefined;
  const pageCount = SETUP_PAGES.length;

  const leave = (skip: boolean): void => {
    const { updateSetupState, setSetupPageSkipped } = useUiStore.getState();
    if (skip && page) setSetupPageSkipped(page.id, true);
    updateSetupState({ dismissedAt: new Date().toISOString(), lastPageId: page?.id ?? null });
    useSetupStore.getState().closeSetup();
  };

  const complete = (): void => {
    useUiStore.getState().updateSetupState({ completedAt: new Date().toISOString(), lastPageId: null });
    useSetupStore.getState().closeSetup();
  };

  const canAdvance = page?.canAdvance?.() ?? true;

  const next = (): void => {
    if (!canAdvance) return;
    const upcoming = nextStep(step, pageCount);
    if (upcoming.kind === 'closed') {
      complete();
      return;
    }
    // Continuing is engaging with the page, not skipping it — clears a skip
    // recorded on an earlier visit (Settings ▸ Accounts' "Resume setup" lands
    // back on the page it was recorded for).
    if (page) useUiStore.getState().setSetupPageSkipped(page.id, false);
    setStep(upcoming);
  };

  const back = (): void => setStep((current) => prevStep(current, pageCount));

  // Escape is the X path. `dialog`, blocking — which also registers the
  // occluder that hides the browser's native view; no `useOccluder` as well.
  useDismiss(true, () => leave(false));
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

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-testid="setup-overlay"
      data-step={step.kind === 'page' && page ? page.id : step.kind}
      className="fixed inset-0 z-dialog flex flex-col bg-background text-foreground outline-none"
    >
      <header className="flex shrink-0 items-center justify-between px-3 pt-3">
        <IconButton icon={LuX} label="Close setup" onClick={() => leave(false)} />
        <ThemeToggle elevated />
      </header>

      <main className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6">
        <div className="my-auto flex w-full max-w-xl flex-col gap-6 py-8">
          {step.kind === 'intro' ? <Intro onBegin={next} /> : null}

          {step.kind === 'page' && page ? (
            <>
              <div className="flex items-center gap-3">
                <span data-testid="setup-title-anchor" className="shrink-0">
                  <BrandMark className="h-8 w-8" />
                </span>
                <h1 className="text-xl font-semibold tracking-tight">{page.titleTyped}</h1>
              </div>
              <page.Component />
              <div className="flex items-center justify-between gap-2">
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

      <footer className="flex shrink-0 flex-col items-center gap-2 pb-5">
        <ol aria-label="Setup pages" className="flex items-center gap-2">
          {SETUP_PAGES.map((row, index) => (
            <li key={row.id}>
              <button
                type="button"
                aria-label={`${row.title} (page ${index + 1} of ${pageCount})`}
                aria-current={dots[index] === 'active' ? 'step' : undefined}
                data-dot={dots[index]}
                onClick={() => setStep({ kind: 'page', index })}
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

/** Static until Theme B's choreography types the wordmark and flies the mark into the anchor. */
function Intro({ onBegin }: { onBegin: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <BrandMark className="h-16 w-16" />
      <Wordmark className="text-3xl" />
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
  );
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
