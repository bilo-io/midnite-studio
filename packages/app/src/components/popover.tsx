import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { useDismissable } from './use-dismissable';
import { useFocusTrap } from './use-focus-trap';

/**
 * A click-toggled panel anchored to its trigger.
 *
 * **Genuinely new, and neither existing surface could stand in.**
 * `tooltip.tsx` is hover-triggered and `pointer-events-none`, so a chart
 * inside it could never be pointed at; `context-menu.tsx` is item-list shaped
 * and positions at a cursor rather than against an element. What they *do*
 * have is the portal-and-clamp mechanics, and those are reused here rather
 * than reinvented.
 *
 * Extracted as a shared primitive rather than inlined into the footer, because
 * the diagnostics segment (Theme F) and Phase 17's checks-verdict indicator
 * both want exactly this and would otherwise each grow their own.
 *
 * The portal is not decoration — see the long note in `tooltip.tsx`. Any
 * ancestor carrying a `transform` becomes the containing block for
 * `position: fixed` descendants *and* opens a stacking context, so a panel
 * rendered beside its trigger inside one lands at the wrong coordinates and
 * paints under later siblings. `<body>` carries neither.
 */
export function Popover({
  trigger,
  children,
  side = 'top',
  align = 'end',
  label,
  title,
  disabled = false,
  panelClassName = '',
  triggerClassName,
  open: controlledOpen,
  onOpenChange,
  testId,
}: {
  /** Rendered inside the button this component owns. */
  trigger: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  /** Which edge of the panel lines up with the trigger. */
  align?: 'start' | 'center' | 'end';
  /** Accessible name for the trigger button. */
  label: string;
  /** Optional title attribute for the trigger button. */
  title?: string;
  /** Whether the trigger button is disabled. */
  disabled?: boolean;
  panelClassName?: string;
  /**
   * Replaces the trigger's default look outright rather than appending to it.
   *
   * Appending would leave the default `hover:bg-accent` fighting whatever the
   * caller wants on hover — two background utilities of equal specificity, the
   * winner decided by stylesheet order rather than by the caller. The rail's
   * version pill is the case: it hovers by deepening its own primary tint, and
   * "keep everything except the hover" is not a thing a class string can say.
   */
  triggerClassName?: string;
  /** Controlled mode. Omit for a self-managed popover. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  testId?: string;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const [placed, setPlaced] = useState({ x: 0, y: 0 });

  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );

  /**
   * Close, and put focus back where it came from.
   *
   * Returning focus is the half that is easy to forget and impossible to work
   * around: without it, dismissing the panel with Escape drops the keyboard
   * user at the top of the document, several tab stops from the footer control
   * they were just using.
   *
   * **Kept deliberately, even though `useFocusTrap` now restores focus by
   * itself** (Phase 68 Theme A, Decision 2) — this is not duplication waiting
   * to be tidied away. The trap restores to a *captured* `document.activeElement`;
   * this restores to a *known* `triggerRef`, which is strictly more reliable for
   * a popover whose trigger is guaranteed to outlive it. The two do not fight:
   * this one runs first, and the trap's "focus already moved deliberately"
   * clause then sees focus sitting on the trigger — outside the closing panel
   * and not `<body>` — and leaves it exactly there.
   */
  const close = useCallback(() => {
    setOpen(false);
    // `preventScroll` for the same reason as the focus trap's: returning focus
    // is a keyboard courtesy, not a licence to move the viewport under the user.
    triggerRef.current?.focus({ preventScroll: true });
  }, [setOpen]);

  /** Position against the trigger, clamped to the viewport. */
  const place = useCallback(() => {
    const anchor = triggerRef.current?.getBoundingClientRect();
    const panel = panelRef.current?.getBoundingClientRect();
    if (!anchor || !panel) return;

    const margin = 6;
    const y = side === 'top' ? anchor.top - panel.height - margin : anchor.bottom + margin;
    const x =
      align === 'start'
        ? anchor.left
        : align === 'center'
          ? anchor.left + anchor.width / 2 - panel.width / 2
          : anchor.right - panel.width;

    // The footer sits against the bottom-right corner, so overflow here is the
    // common case rather than an edge case — the same correction the tooltip
    // and the context menu both make.
    setPlaced({
      x: clamp(x, margin, window.innerWidth - panel.width - margin),
      y: clamp(y, margin, window.innerHeight - panel.height - margin),
    });
  }, [side, align]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place, children]);

  /**
   * Re-place whenever the panel's own size changes.
   *
   * The effect above cannot see it. Its `children` dependency catches a panel
   * that changes because *this* component re-rendered, but a panel whose
   * content arrives asynchronously re-renders itself — a query resolving inside
   * it never reaches this scope. `side="top"` is where that shows: the panel is
   * positioned by subtracting a height it no longer has, so a panel that grew
   * after mount hangs down over its own trigger, and past the bottom of the
   * window the clamp was supposed to keep it inside.
   */
  useEffect(() => {
    if (!open || typeof ResizeObserver === 'undefined') return;
    const panel = panelRef.current;
    if (!panel) return;
    const observer = new ResizeObserver(() => place());
    observer.observe(panel);
    return () => observer.disconnect();
  }, [open, place]);

  // Escape, an outside `pointerdown`, and focus leaving — by Tab past either
  // end or by anything else taking it — all go through `useDismissable`. The
  // trigger counts as inside, so its own click toggles rather than the
  // pointerdown closing the panel and the click reopening it. Escape and Tab
  // hand focus back to the trigger; the hook's registration also does the
  // occluder bookkeeping and keeps one Escape to one surface (Phase 62).
  //
  // `tab: 'edges'`, not `'close'`: this is a panel of controls, not a
  // `role="menu"`, so Tab has to walk them. Only walking out of it closes it —
  // which is what makes the focus trap's wrap unreachable from the keyboard
  // now, and the trap itself kept only for placing focus on open and handing
  // it back on close.
  useDismissable({
    open,
    surfaceRef: panelRef,
    trigger: triggerRef,
    layer: 'popover',
    tab: 'edges',
    onDismiss: () => setOpen(false),
  });

  // A capture-phase scroll anywhere in the app. Scroll dismisses rather than
  // repositions: the panel is anchored to an element that just moved, and
  // chasing it mid-scroll reads as a glitch.
  useEffect(() => {
    if (!open) return;
    // Scrolling *inside* the panel is the user reading it, not the anchor
    // moving out from under it — the notifications list is `overflow-y-auto`
    // and would otherwise dismiss itself on its own first wheel event.
    const onScroll = (event: Event) => {
      const target = event.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [open, setOpen]);

  // Move focus into the panel on open and back out on close. Tab no longer
  // wraps here in practice — `useDismissable`'s `tab: 'edges'` closes the
  // panel as focus walks off either end, so focus never lands on controls
  // behind a surface that is still on screen, which is what the trap was for.
  useFocusTrap(panelRef, open);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? id : undefined}
        aria-label={label}
        title={title}
        data-testid={testId}
        onClick={() => {
          if (disabled) return;
          if (open) {
            close();
          } else {
            setOpen(true);
          }
        }}
        className={
          triggerClassName ??
          'flex items-center gap-3 rounded px-1 transition-colors hover:bg-accent hover:text-foreground data-[open=true]:bg-accent'
        }
        data-open={open}
      >
        {trigger}
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={id}
              role="dialog"
              aria-label={label}
              tabIndex={-1}
              data-testid={testId ? `${testId}-panel` : undefined}
              className={`fixed z-popover animate-fade-in gradient-border gradient-border--always rounded-md border border-border bg-popover text-popover-foreground shadow-xl outline-none ${panelClassName}`}
              style={{ left: placed.x, top: placed.y }}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));
