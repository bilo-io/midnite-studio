import type { Resizable } from './use-resizable';

/**
 * The draggable rule between two panes.
 *
 * A 1px rule with a 5px hit area, not a 5px rule: a visible splitter thick
 * enough to hit comfortably reads as a piece of UI in its own right and eats
 * space in every layout it appears in. The extra width is negative margin, so
 * the handle overlaps its neighbours instead of displacing them.
 */
/** Grab target, in px. See the note above on why it is not the visible rule. */
const HIT = 5;

export function ResizeHandle({
  resizable,
  axis,
  label,
  gap,
  className = '',
}: {
  resizable: Resizable;
  axis: 'x' | 'y';
  /** Accessible name, e.g. "Resize repositories sidebar". */
  label: string;
  /**
   * The flex `gap` of the row this handle sits in, in px.
   *
   * Given one, the handle pulls itself in by half its own width plus that gap,
   * so dropping it between two cells moves neither of them. Without it a handle
   * costs its 1px of net width PLUS an extra gap — which is why the graph
   * table's header used to sit nine pixels right of the rows it labelled for
   * every handle that preceded it, and eighteen by the third.
   *
   * A pane splitter (the repos sidebar, the detail pane) sits between two flex
   * items with no gap and wants the default: it is the only thing separating
   * them, so it is allowed to take a pixel.
   */
  gap?: number;
  className?: string;
}) {
  const vertical = axis === 'x';
  const pull = gap === undefined ? undefined : -(HIT + gap) / 2;

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      title={`${label} — drag, or double-click to reset`}
      {...resizable.handleProps}
      style={
        pull === undefined
          ? undefined
          : vertical
            ? { marginInline: pull }
            : { marginBlock: pull }
      }
      data-snap={resizable.snap ?? undefined}
      /*
        Above the panes it separates, not level with them.

        The 5px grab target is negative margin — it overlaps its neighbours by
        2px on each side rather than displacing them — so at an equal z-index
        whichever neighbour comes later in the DOM takes those pixels back. The
        terminal's frame is exactly that case (`relative z-10`, and after its
        splitter), which left two of the splitter's five grab pixels belonging
        to the terminal. z-20 is the FAB button's level, and the button is later
        in the DOM again, so it still wins where the two overlap.
      */
      className={`group relative z-20 shrink-0 touch-none transition-colors focus-visible:outline-none ${
        vertical
          ? `w-[5px] cursor-col-resize ${pull === undefined ? '-mx-[2px]' : ''}`
          : `h-[5px] cursor-row-resize ${pull === undefined ? '-my-[2px]' : ''}`
      } ${className}`}
    >
      {/*
        The rule itself, centred in the hit area. Painted on a child rather
        than as the parent's background so the 5px grab target stays invisible
        while the 1px line is what the user sees.

        A drag that has run past its bound and armed a snap thickens the rule to
        the full hit area: the pane itself has stopped moving by then, so
        without this the only thing telling the user their overshoot is about to
        close or maximize something is the cursor's own distance from a splitter
        that is no longer following it.
      */}
      <span
        aria-hidden
        className={`pointer-events-none absolute bg-border transition-[background-color,width,height] group-hover:bg-primary/50 group-focus-visible:bg-primary ${
          resizable.dragging ? '!bg-primary' : ''
        } ${
          vertical
            ? `inset-y-0 left-1/2 -translate-x-1/2 ${resizable.snap ? 'w-[5px]' : 'w-[2px]'}`
            : `inset-x-0 top-1/2 -translate-y-1/2 ${resizable.snap ? 'h-[5px]' : 'h-[2px]'}`
        }`}
      />
    </div>
  );
}
