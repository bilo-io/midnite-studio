import { useEffect, useRef, useState } from 'react';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useDismiss } from '../../components/use-dismiss';
import { ExternalLink } from '../markdown/external-link';
import { MARKDOWN_PROSE_CLASSES } from '../markdown/prose';
import type { Deck } from './deck-parser';
import { HelpOverlay } from './help-overlay';
import { SlideCode, SlidePre } from './slide-code';
import { useDeckNav } from './use-deck-nav';
import { useTitleTypewriter } from './use-title-typewriter';

const MARKDOWN_COMPONENTS = { a: ExternalLink, code: SlideCode, pre: SlidePre };

/**
 * The deck presenter: one slide at a time, a typewriter title, and a
 * step-by-step reveal of the rest — ported from midnite's `Deck` component
 * minus the OS Fullscreen API and the CRUD chrome (exit-to-route, a router),
 * neither of which apply to an in-app modal. Navigation keys are a bubble-phase
 * `window` listener — the modal traps focus (Theme C), so nothing behind it
 * ever sees the event. Escape is not among them: it goes through the shared
 * dismissal stack, like every other overlay's (Phase 62).
 */
export function Deck({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const stepCounts = deck.slides.map((slide) => slide.steps.length);
  const nav = useDeckNav(stepCounts);
  const slide = deck.slides[nav.index]!;
  const title = useTitleTypewriter(slide.title, nav.instant);
  const [showHelp, setShowHelp] = useState(false);

  /*
    A "latest values" ref rather than re-subscribing the listener on every
    dependency change: two keys pressed in quick succession (the common case —
    holding the arrow key down) must never have the second one caught by a
    listener still closed over the *previous* render's `nav`/`title`, which a
    `useEffect([showHelp, title.done, nav.index, nav.reveal])` dependency list
    cannot guarantee ahead of the browser's next keydown. Mutating a ref during
    render is safe here because nothing renders from `latest` itself; it only
    ever feeds the one stable listener below.
  */
  const latest = useRef({ showHelp, title, nav });
  latest.current = { showHelp, title, nav };

  /*
    TWO entries on the shared dismissal stack (Phase 62), not one handler with
    an internal `if (showHelp)` — the ordering between them is the whole point,
    and a conditional would hide it again.

    The help overlay only registers while it is open, so it always carries the
    later sequence number and outranks the deck's own exit at the same layer:
    Escape closes help first, then the deck. That is exactly what the single
    `window` listener achieved by accident, now stated rather than inferred.
  */
  useDismiss(showHelp, () => setShowHelp(false), { layer: 'inline' });
  useDismiss(true, onClose, { layer: 'inline' });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { showHelp, title, nav } = latest.current;
      if (showHelp) {
        // Escape is the stack's now; `?` is this overlay's own toggle. Every
        // other key stays swallowed while help is up.
        if (event.key === '?') {
          event.preventDefault();
          setShowHelp(false);
        }
        return;
      }
      switch (event.key) {
        case '?':
          event.preventDefault();
          setShowHelp(true);
          break;
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
        case 'Enter':
        case 'PageDown':
          event.preventDefault();
          if (!title.done) title.complete();
          else nav.next();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'Backspace':
        case 'PageUp':
          event.preventDefault();
          if (!title.done) title.complete();
          else nav.prev();
          break;
        case 'Home':
          event.preventDefault();
          nav.home();
          break;
        case 'End':
          event.preventDefault();
          nav.end();
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const onStageClick = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest('a')) return;
    if (!title.done) title.complete();
    else nav.next();
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="slides-deck">
      <main
        className="flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden px-8 py-6"
        onClick={onStageClick}
      >
        <div className={`w-full max-w-3xl ${slide.cover ? 'text-center' : ''}`}>
          <h1 className="text-2xl font-semibold tracking-tight">
            {title.typed}
            {!title.done ? (
              <span aria-hidden className="ml-0.5 inline-block h-5 w-0.5 animate-pulse bg-foreground align-middle" />
            ) : null}
          </h1>
          <ul className="mt-6 max-h-full space-y-3 overflow-y-auto">
            {slide.steps.slice(0, nav.reveal).map((step, index) => (
              <li key={index} data-step={index} className={MARKDOWN_PROSE_CLASSES}>
                <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                  {step.markdown}
                </Markdown>
              </li>
            ))}
          </ul>
        </div>
      </main>

      <footer className="flex shrink-0 items-center justify-center gap-2 border-t border-border py-3">
        {deck.slides.map((_, index) => (
          <button
            key={index}
            type="button"
            aria-label={`Slide ${index + 1} of ${deck.slides.length}`}
            aria-current={index === nav.index}
            onClick={() => nav.jump(index)}
            className={`h-1.5 w-1.5 rounded-full transition-colors ${
              index === nav.index ? 'bg-primary' : 'bg-border hover:bg-muted-foreground/60'
            }`}
          />
        ))}
        <span className="ml-2 text-[11px] tabular-nums text-muted-foreground">
          {nav.index + 1} / {deck.slides.length}
        </span>
      </footer>

      {showHelp ? <HelpOverlay onClose={() => setShowHelp(false)} /> : null}
    </div>
  );
}
