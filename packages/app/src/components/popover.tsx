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
  panelClassName = '',
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
  panelClassName?: string;
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
   */
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, [setOpen]);

  /** Position against the trigger, clamped to the viewport. */
  useLayoutEffect(() => {
    if (!open) return;
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
  }, [open, side, align, children]);

  // Escape, outside click, and a capture-phase scroll anywhere in the app.
  // Scroll dismisses rather than repositions: the panel is anchored to an
  // element that just moved, and chasing it mid-scroll reads as a glitch.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      // The trigger's own click toggles; letting this fire too would close and
      // immediately reopen, so the panel would never respond to its button.
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, close, setOpen]);

  /**
   * Keep Tab inside the panel while it is open.
   *
   * A panel that lets Tab walk out from under it is worse than one with no
   * keyboard support at all: focus lands on controls the user cannot see,
   * behind a surface that is still on screen.
   */
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      // Nothing focusable inside: hold focus on the panel rather than letting
      // Tab escape into the document behind it.
      if (!first || !last) {
        event.preventDefault();
        panel.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    panel.focus();
    panel.addEventListener('keydown', onKeyDown);
    return () => panel.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? id : undefined}
        aria-label={label}
        data-testid={testId}
        onClick={() => (open ? close() : setOpen(true))}
        className="flex items-center gap-3 rounded px-1 transition-colors hover:bg-accent hover:text-foreground data-[open=true]:bg-accent"
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
              className={`fixed z-[70] animate-fade-in rounded-md border border-border bg-popover text-popover-foreground shadow-xl outline-none ${panelClassName}`}
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

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));
