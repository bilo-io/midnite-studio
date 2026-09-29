import { useLayoutEffect, useRef, type ReactNode } from 'react';

import type { GraphRow } from '@midnite/studio-shared';

import { ResizeHandle } from '../../components/resizable/resize-handle';
import type { Resizable } from '../../components/resizable/use-resizable';
import { isReducedMotion } from '../../lib/reduced-motion';
import { CiSpacer } from './ci-cell';
import { RAIL_WIDTH, laneCentre, showsAuthorColumn, type GraphTheme } from './graph-themes';
import { laneColor } from './lane-colors';

/**
 * The git graph's expand-in-place slot: the panel a row opens underneath
 * itself, the animation that opens and closes it, and the lanes that carry on
 * past it.
 *
 * **Lanes pass BEHIND the panel.** The slot draws every lane that leaves the
 * expanded row's bottom edge as a straight line the full height of the slot,
 * and the panel is an opaque card inset a few pixels from the slot's top and
 * bottom — so each lane visibly runs under the card and comes out the other
 * side into the next row at exactly the x it went in. Lanes running THROUGH a
 * gap left of the card would have cost the panel the whole branch/tag column's
 * width, which is where the file list wants to be.
 *
 * Nothing here lays out lanes. Which lanes continue is read straight off the
 * row main already laid out (`GraphRow.edges`), per "lane layout runs in
 * main": a `straight` edge passes through the row in its own lane, a `merge`
 * edge leaves the node for the lane it names, and those are exactly the lanes
 * crossing the row's bottom edge.
 */

/** Expand and collapse durations. Collapsing is a little quicker — it is "put it away". */
export const EXPAND_MS = 200;
export const COLLAPSE_MS = 160;
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Gap between the slot's edges and the card — where the lanes show going under it. */
export const SLOT_INSET = 4;

/** One lane crossing the slot. */
export type SlotLane = { lane: number; colorIdx: number; dashed?: boolean };

/** The lanes that cross `row`'s bottom edge, one per lane, in lane order. */
export function lanesLeaving(row: GraphRow): SlotLane[] {
  const byLane = new Map<number, number>();
  for (const edge of row.edges) {
    if (edge.type === 'straight') byLane.set(edge.fromLane, edge.colorIdx);
    else if (edge.type === 'merge') byLane.set(edge.toLane, edge.colorIdx);
  }
  return [...byLane.entries()]
    .sort(([a], [b]) => a - b)
    .map(([lane, colorIdx]) => ({ lane, colorIdx }));
}

/**
 * Animates its child open and shut, height and opacity together, with the Web
 * Animations API — script-driven rather than a CSS transition because the
 * start and end heights are only known at run time, and because the host has
 * to know when a collapse has FINISHED (`onExited`) to take the slot away.
 *
 * `seen` is the host's record of which panels have already played their
 * entrance. The graph is virtualized, so an expanded row scrolled far away and
 * back is unmounted and remounted — and a panel that re-animated open every
 * time it scrolled into view would look like it was opening again. A remount
 * of a panel that is still open finds its id in `seen` and appears settled.
 *
 * Reduced motion (either dialect, `lib/reduced-motion.ts`) and a DOM without
 * `Element.animate` (jsdom) both resolve instantly, calling `onEntered` /
 * `onExited` synchronously, so nothing waits on an animation that never runs.
 */
export function InlineExpander({
  id,
  open,
  seen,
  onEntered,
  onExited,
  children,
}: {
  id: string;
  open: boolean;
  seen: Set<string>;
  onEntered?: () => void;
  onExited?: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Read through refs so an inline arrow from the host never restarts the animation.
  const callbacks = useRef({ onEntered, onExited });
  callbacks.current = { onEntered, onExited };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const animated = typeof el.animate === 'function' && !isReducedMotion();

    if (open) {
      if (seen.has(id)) return;
      seen.add(id);
      if (!animated) {
        callbacks.current.onEntered?.();
        return;
      }
      const height = el.scrollHeight;
      const animation = el.animate(
        [
          { height: '0px', opacity: 0 },
          { height: `${height}px`, opacity: 1 },
        ],
        { duration: EXPAND_MS, easing: EASING },
      );
      let live = true;
      let finished = false;
      animation.finished.then(
        () => {
          finished = true;
          if (live) callbacks.current.onEntered?.();
        },
        () => {},
      );
      return () => {
        live = false;
        animation.cancel();
        // Cut off before it finished — StrictMode's effect replay, or the row
        // scrolled out mid-animation: it has not been seen yet, so the next
        // mount plays it rather than appearing settled.
        if (!finished) seen.delete(id);
      };
    }

    seen.delete(id);
    if (!animated) {
      callbacks.current.onExited?.();
      return;
    }
    const height = el.getBoundingClientRect().height;
    const animation = el.animate(
      [
        { height: `${height}px`, opacity: 1 },
        { height: '0px', opacity: 0 },
      ],
      // `forwards`, so the last frame holds until the host unmounts the slot.
      { duration: COLLAPSE_MS, easing: EASING, fill: 'forwards' },
    );
    let live = true;
    animation.finished.then(
      () => {
        if (live) callbacks.current.onExited?.();
      },
      () => {},
    );
    return () => {
      live = false;
      animation.cancel();
    };
  }, [open, id, seen]);

  return (
    <div
      ref={ref}
      className="overflow-hidden"
      data-graph-inline-state={open ? 'open' : 'closing'}
    >
      {children}
    </div>
  );
}

/**
 * The expanded slot itself: continuing lanes behind, the card in front, and a
 * splitter along its bottom edge to make the panel taller or shorter.
 *
 * The card's height is `height` — the host has already clamped it to a share
 * of the graph, so a huge diff scrolls inside the card instead of pushing the
 * rows around it off screen.
 */
export function InlineSlot({
  label,
  lanes,
  theme,
  gutterWidth,
  laneWidth,
  height,
  resizable,
  children,
}: {
  /** The card's accessible name — it is a `region`. */
  label: string;
  lanes: readonly SlotLane[];
  theme: GraphTheme;
  gutterWidth: number;
  laneWidth: number;
  height: number;
  resizable: Resizable;
  children: ReactNode;
}) {
  return (
    <div
      className="relative"
      style={{ paddingTop: SLOT_INSET, paddingBottom: SLOT_INSET }}
      data-graph-inline-slot=""
    >
      <LaneContinuation lanes={lanes} theme={theme} gutterWidth={gutterWidth} laneWidth={laneWidth} />
      <section
        role="region"
        aria-label={label}
        className="relative z-[1] mx-2 overflow-hidden rounded-md border border-border bg-background shadow-lg"
        style={{ height }}
      >
        {children}
      </section>
      <div className="relative z-[2] mx-2">
        <ResizeHandle resizable={resizable} axis="y" label="Resize the inline panel" />
      </div>
    </div>
  );
}

/**
 * The lanes running under the card, on exactly the horizontal grid the rows
 * use — every cell of a row, in order, with the row's own column classes:
 * the BRANCH / TAG cell (`.graph-ref-col`, which shrinks), the CI column's
 * slot (`CiSpacer`, hidden with the column or below the graph's narrow
 * container width), the gutter, the avatar styles' rail, the message cell
 * (`.graph-msg-col`) and the trailing column spacers. Mirroring the whole
 * row rather than computing an offset is what keeps the lanes on the rows'
 * x at every width: the ref column gives up width as the graph narrows, and
 * it gives up exactly the same amount here only because every sibling that
 * competes with it is here too.
 */
export function LaneContinuation({
  lanes,
  theme,
  gutterWidth,
  laneWidth,
}: {
  lanes: readonly SlotLane[];
  theme: GraphTheme;
  gutterWidth: number;
  laneWidth: number;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex gap-2 pr-3"
      data-graph-lane-continuation=""
    >
      <div className="graph-ref-col pl-2" style={{ width: 'var(--col-branch-tag)' }} />
      <CiSpacer />
      <span className="flex shrink-0">
        <svg width={gutterWidth} height="100%" className="block shrink-0 overflow-visible">
          {lanes.map(({ lane, colorIdx, dashed }) => {
            const x = laneCentre(theme, laneWidth, lane);
            return (
              <line
                key={lane}
                x1={x}
                y1="0"
                x2={x}
                y2="100%"
                stroke={laneColor(colorIdx, theme.palette)}
                strokeWidth={theme.strokeWidth}
                {...(dashed
                  ? { strokeDasharray: `${theme.strokeWidth * 2} ${theme.strokeWidth * 1.5}` }
                  : {})}
              />
            );
          })}
        </svg>
      </span>
      {theme.node === 'avatar' ? <span className="shrink-0" style={{ width: RAIL_WIDTH }} /> : null}
      <div className="graph-msg-col flex-1" />
      {showsAuthorColumn(theme) ? (
        <span className="shrink-0" style={{ width: 'var(--col-author)' }} />
      ) : null}
      <span className="shrink-0" style={{ width: 'var(--col-date)' }} />
      <span className="shrink-0" style={{ width: 'var(--col-sha)' }} />
    </div>
  );
}
