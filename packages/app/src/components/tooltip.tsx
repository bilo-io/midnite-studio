import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * A hover/focus tooltip.
 *
 * Exists because neither `@bilo-io/ui` nor `@bilo-io/shell` ships one and the
 * app had ~20 native `title=` attributes. The native tooltip is not a styling
 * problem so much as a timing and a11y one: it takes about a second to appear,
 * cannot be triggered by keyboard at all, and renders in the OS's colours in
 * the middle of a themed window.
 *
 * The trigger is cloned rather than wrapped in a `<span>` — a wrapper element
 * would break the flex/grid layouts these controls sit in, and would sever the
 * dnd-kit listeners the graph's badges rely on.
 *
 * The bubble is portalled to `<body>`; see the note on the portal below for
 * why rendering it next to the trigger is not an option.
 */
export function Tooltip({
  label,
  side = 'bottom',
  children,
}: {
  /** The tooltip text. Also becomes the trigger's accessible description. */
  label: ReactNode;
  side?: 'top' | 'bottom';
  /** A single focusable element. Cloned, not wrapped. */
  children: ReactElement<Record<string, unknown>>;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [placed, setPlaced] = useState({ x: 0, y: 0 });

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  /**
   * A delay on open but never on close.
   *
   * Without the delay, sweeping the pointer across a toolbar pops a tooltip for
   * every button on the way past. Without the *absence* of a close delay, the
   * bubble lingers over whatever the user moved on to click.
   */
  const show = useCallback(() => {
    cancel();
    timer.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  }, [cancel]);

  const hide = useCallback(() => {
    cancel();
    setOpen(false);
  }, [cancel]);

  useEffect(() => cancel, [cancel]);

  /**
   * Position against the trigger, clamped to the window — the same correction
   * <ContextMenu> makes, and for the same reason: a control in the title bar's
   * right cluster is millimetres from the viewport edge, so overflow is the
   * common case rather than an edge case. `useLayoutEffect` so it lands before
   * paint instead of visibly jumping.
   */
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const bubble = bubbleRef.current;
    if (!trigger || !bubble) return;

    const anchor = trigger.getBoundingClientRect();
    const box = bubble.getBoundingClientRect();
    const margin = 6;

    const y = side === 'top' ? anchor.top - box.height - margin : anchor.bottom + margin;
    setPlaced({
      x: clamp(
        anchor.left + anchor.width / 2 - box.width / 2,
        margin,
        window.innerWidth - box.width - margin,
      ),
      y: clamp(y, margin, window.innerHeight - box.height - margin),
    });
  }, [open, side, label]);

  // Escape dismisses, matching every other transient surface in the app. The
  // listener only exists while open, so it never competes with the context
  // menu's own handler.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', hide, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', hide, true);
    };
  }, [open, hide]);

  const trigger = cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      assignRef(children, node);
    },
    // `describedby`, not `labelledby`: the control keeps its own accessible
    // name (its aria-label), and the tooltip adds detail rather than replacing
    // it. Only wired while open — a description pointing at an absent node is
    // a broken reference, not an empty one.
    'aria-describedby': open ? id : undefined,
    onMouseEnter: chain(children.props.onMouseEnter, show),
    onMouseLeave: chain(children.props.onMouseLeave, hide),
    onFocus: chain(children.props.onFocus, () => setOpen(true)),
    onBlur: chain(children.props.onBlur, hide),
    // A click means the user has committed to the action; the label has done
    // its job and the bubble is now just covering the result.
    onClick: chain(children.props.onClick, hide),
  } as Record<string, unknown>);

  return (
    <>
      {trigger}
      {/*
        Portalled to <body>, not rendered beside the trigger.

        The graph's rows are virtualized, so each one carries a
        `transform: translateY(...)`. A transform makes the element the
        containing block for `position: fixed` descendants AND opens a stacking
        context, which broke the bubble twice over: viewport coordinates were
        re-read as row-relative ones, so it landed a row's offset away from the
        node it describes, and `z-tooltip` could only outrank things inside that
        one row, so every row painted after it covered it. `<body>` carries
        neither, which is what `fixed` and the z-index were written against.
      */}
      {open
        ? createPortal(
            <div
              ref={bubbleRef}
              id={id}
              role="tooltip"
              className="pointer-events-none fixed z-tooltip max-w-xs animate-fade-in rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-lg"
              style={{ left: placed.x, top: placed.y }}
            >
              {label}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** Open delay, in ms. Long enough to survive a pointer sweeping past. */
const OPEN_DELAY_MS = 400;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

/** Run the child's own handler before ours, so cloning never swallows one. */
function chain(
  theirs: unknown,
  ours: () => void,
): (event: unknown) => void {
  return (event) => {
    if (typeof theirs === 'function') (theirs as (e: unknown) => void)(event);
    ours();
  };
}

/**
 * Forward the node to whatever ref the child already carried.
 *
 * The graph's ref badges are dnd-kit drag sources, and dnd-kit tracks them by
 * ref; overwriting it with ours would silently break dragging on exactly the
 * elements most likely to want a tooltip.
 */
function assignRef(child: ReactElement, node: HTMLElement | null): void {
  const ref = (child as unknown as { ref?: unknown }).ref;
  if (typeof ref === 'function') (ref as (n: HTMLElement | null) => void)(node);
  else if (ref && typeof ref === 'object') {
    (ref as { current: HTMLElement | null }).current = node;
  }
}
