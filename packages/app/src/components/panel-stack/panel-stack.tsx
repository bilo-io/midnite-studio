import { useEffect, useRef, useState, type ReactNode } from 'react';

import { motionMs } from '../use-reveal';
import type { PanelHistory } from './use-panel-history';

type Direction = 'forward' | 'back';

/**
 * Renders a `PanelHistory`'s current entry with a directional slide (Phase
 * 42 Theme A/B) — forward pushes in from the right, back from the left. Only
 * two panes are ever mounted during a transition; the outgoing one unmounts
 * once its slide has had time to finish.
 *
 * **Transition-driven, not `@keyframes`-driven — a deliberate choice, not an
 * oversight.** `@bilo-io/shell/appearance.css` (imported once, app-wide)
 * carries a universal `html[data-motion='reduced'] *` reset that forces
 * `animation-duration`/`transition-duration` to `0.001ms !important` — but it
 * **pins a `@keyframes` animation to its last frame** rather than removing
 * it, which for a slide only happens to be the correct end position by luck.
 * A `transition` on `transform` collapses honestly under that same reset: an
 * instant transition still lands on the right value. See `styles.css`'s own
 * `.panel-stack-pane` rules for the belt-and-suspenders per-class override —
 * Phase 39 Theme G shipped believing a reduced-motion rule worked when it had
 * lost on specificity, so this repo no longer assumes the cascade without
 * checking it (Theme F's job, not this one's).
 *
 * Reads `motionMs()` for the duration rather than a hard-coded number — the
 * app's one duration source — but does **not** widen its `data-motion ===
 * 'reduced'`-only check for the default `'system'` + OS-reduce blind spot
 * that check has: that is a shared-helper behaviour change with its own
 * before/after, out of scope for a Councils-focused phase. The CSS transition
 * itself is what carries the system-default case correctly (see
 * `styles.css`).
 */
export function PanelStack<T>({
  history,
  render,
  className,
}: {
  history: PanelHistory<T>;
  render: (entry: T) => ReactNode;
  className?: string;
}) {
  const prevIndexRef = useRef(history.index);
  const prevEntryRef = useRef(history.current);
  const [outgoing, setOutgoing] = useState<{ entry: T; direction: Direction } | null>(null);
  const [entered, setEntered] = useState(true);

  useEffect(() => {
    if (history.index === prevIndexRef.current) {
      prevEntryRef.current = history.current;
      return undefined;
    }

    const direction: Direction = history.index > prevIndexRef.current ? 'forward' : 'back';
    const leaving = prevEntryRef.current;
    setOutgoing({ entry: leaving, direction });
    setEntered(false);
    prevIndexRef.current = history.index;
    prevEntryRef.current = history.current;

    // Next frame, so the browser paints the start position before the
    // transition to the end position begins — starting both in the same
    // frame would skip the animation entirely.
    const raf = requestAnimationFrame(() => setEntered(true));
    // Not `transitionend`: under reduced motion the transition may complete
    // in effectively zero time or not fire a trailing event consistently
    // across browsers, and a timer is simpler than racing both. `motionMs()`
    // is read once per transition, matching what the CSS itself will use.
    const timer = setTimeout(() => setOutgoing(null), motionMs() + 50);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    // `history` itself, not just `.index`/`.current`: `usePanelHistory` only
    // hands out a new object when its state actually changes, so this still
    // fires exactly on navigation — and satisfies the hook that `.current`
    // read off a plain object isn't a valid dependency on its own.
  }, [history]);

  const offscreen = (direction: Direction): string =>
    direction === 'forward' ? 'translateX(100%)' : 'translateX(-100%)';

  const incomingTransform = !outgoing || entered ? 'translateX(0)' : offscreen(outgoing.direction);
  const outgoingTransform = outgoing
    ? entered
      ? offscreen(outgoing.direction === 'forward' ? 'back' : 'forward')
      : 'translateX(0)'
    : undefined;

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`}>
      {outgoing ? (
        <div
          aria-hidden
          className="panel-stack-pane pointer-events-none absolute inset-0"
          style={{ transform: outgoingTransform, transitionDuration: `${motionMs()}ms` }}
        >
          {render(outgoing.entry)}
        </div>
      ) : null}
      <div
        className="panel-stack-pane absolute inset-0"
        style={{ transform: incomingTransform, transitionDuration: `${motionMs()}ms` }}
      >
        {render(history.current)}
      </div>
    </div>
  );
}
