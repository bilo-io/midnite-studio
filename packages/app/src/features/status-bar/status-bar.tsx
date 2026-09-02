import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

import { collapseFor } from '../../lib/density';
import { InProgressLiveRegion } from './in-progress';
import { OpProgressLiveRegion } from './op-progress';
import { OverflowPopover } from './overflow-popover';
import { STATUS_SEGMENTS, type StatusSegment, type StatusZone } from './segments';
import {
  strandedSeparators,
  withSeparators,
  type RenderedKind,
} from './segments-groups';
import { StatusSeparator } from './status-separator';
import { useOverflow } from './use-overflow';

/**
 * The status bar: the shortcut rail and this repository's health on the left,
 * operation progress in the middle, and the machine's vitals in the right half.
 *
 * It no longer repeats the checkout's git status — branch, ahead/behind and
 * the change count all live in the title bar, where the breadcrumb and the
 * sync cluster already say them. Two readings of the same thing, one at each
 * edge of the window, is one more place to disagree and no more information.
 * Phase 39 applied that same argument to the command palette and Go-to-File,
 * which used to sit in both places and now sit only here.
 *
 * Spans the full content area as of Phase 27 Theme A — mounted as a sibling of
 * the content row inside CONTENT_BOX, so the `border-t` runs under the
 * repositories panel too.
 *
 * Three-column grid as of Theme C — `grid-cols-[1fr_auto_1fr]` gives the
 * centre zone a true middle that cannot drift as the left zone's content
 * changes length, and the `auto` track collapses to zero width when nothing
 * is mounted there, so the left and right zones are not pushed inward by an
 * empty centre. Each zone maps its render list directly, **no wrapping
 * element** — because a `<div>` around a segment that returns `null` still
 * occupies a `gap-3` slot, and five absent segments would be 60px of
 * unexplained space. That constraint is also what makes Phase 39's separator
 * rule work at all: with no wrappers, a zone's live `children` list is already
 * an exact record of which segments rendered.
 *
 * Theme E's overflow sits on top of `STATUS_SEGMENTS` rather than a second
 * source of truth: `data-density` on this `<footer>` drives every segment's
 * own `.status-label` / `.status-chord` CSS (`styles.css`) — compact/collapsed
 * hide them, full does not — so a segment already using those classes earns
 * compact styling for free. `collapsed` additionally removes a zone's segments
 * from here and hands them to the one shared `OverflowPopover`.
 *
 * **Zones never shrink their children.** A default flex row lets its
 * children shrink and their text wrap, which keeps `scrollWidth` equal to
 * `clientWidth` forever — the browser silently squeezes content instead of
 * `useOverflow` ever seeing an overflow to measure. `whitespace-nowrap` plus
 * `[&>*]:shrink-0` makes a zone's min-content its full natural width, so a
 * genuine shortage of room shows up as real overflow rather than clipped
 * text nobody asked for.
 */
function zoneSegments(zone: StatusZone): StatusSegment[] {
  return STATUS_SEGMENTS.filter((s) => s.zone === zone);
}

const ZONES: StatusZone[] = ['left', 'center', 'right'];

type CollapseResult = { visible: StatusSegment[]; collapsed: StatusSegment[] };

/**
 * Hide the separators that ended up with nothing on one side of them.
 *
 * Runs against the DOM rather than against the registry because a segment
 * announces "nothing to report" by returning `null`, and only its own hooks
 * know whether it did. The `health` group is the case that forced this: one
 * member, `DiagnosticsSegment`, which renders nothing at all for a repository
 * nobody has measured — so a fresh install would draw two separators around an
 * empty space.
 *
 * Two mechanisms, because there are two ways the answer can change:
 *
 * - A **layout effect on every render** catches anything this component
 *   re-rendered for (density flips, a zone's segment list changing).
 * - A **`MutationObserver`** catches the case there is no render here to hang
 *   off: a segment flipping from `null` to visible re-renders *itself*. The
 *   observer watches `childList` on the three zone elements only, and its
 *   callback is a handful of array reads over at most ten nodes.
 */
/** Returns whether anything actually changed, so a re-measure can be conditional. */
function prune(el: HTMLElement): boolean {
  const children = Array.from(el.children);
  const kinds: RenderedKind[] = children.map((child) =>
    child.hasAttribute('data-status-sep') ? 'separator' : 'segment',
  );
  const hidden = strandedSeparators(kinds);
  let changed = false;
  children.forEach((child, i) => {
    if (kinds[i] !== 'separator') return;
    const next = hidden.has(i);
    if ((child as HTMLElement).hidden === next) return;
    (child as HTMLElement).hidden = next;
    changed = true;
  });
  return changed;
}

type ZoneRef = RefObject<HTMLDivElement | null>;

/**
 * `onChange` fires whenever a prune actually changed the DOM — `useOverflow`'s
 * cue to measure again.
 *
 * Hiding a separator removes a 1px rule *and* its 12px `gap-3` slot from a zone,
 * but does not change the `<footer>`'s own `clientWidth`, so the
 * `ResizeObserver` watching that footer never fires. Without this the density
 * decision would be made against a width that included separators the very next
 * effect removed — and `lastWidths` would cache it.
 *
 * A callback rather than a revision counter this component renders on: a
 * counter meant `setState` inside a dependency-free layout effect, which eslint
 * correctly flags as an infinite-update hazard and which cost an extra render
 * per prune. It is passed as a ref so this hook can be called *before*
 * `useOverflow` — which is what guarantees its layout effect runs first — while
 * still reaching a function `useOverflow` has not returned yet.
 */
function useSeparatorPruning(
  left: ZoneRef,
  center: ZoneRef,
  right: ZoneRef,
  onChange: RefObject<() => void>,
): void {
  // Refs are stable for the component's life, so this array is safe to rebuild
  // per render and safe to read from an effect with an empty dependency list.
  const live = (): HTMLDivElement[] =>
    [left.current, center.current, right.current].filter(
      (el): el is HTMLDivElement => el !== null,
    );

  // Every render — no dependency array on purpose.
  useLayoutEffect(() => {
    let changed = false;
    for (const el of live()) changed = prune(el) || changed;
    if (changed) onChange.current();
  });

  // Once — the observers outlive individual renders.
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const observers = live().map((el) => {
      const observer = new MutationObserver(() => {
        if (prune(el)) onChange.current();
      });
      observer.observe(el, { childList: true });
      return observer;
    });
    return () => {
      for (const observer of observers) observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function StatusBar() {
  const ref = useRef<HTMLElement | null>(null);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const centerRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  /*
    Pruning is called BEFORE `useOverflow`, so its layout effect is registered
    first and therefore runs first: the very first `measure()` reads a
    `scrollWidth` with the stranded separators already gone. Ordering alone is
    not enough afterwards — a segment can flip from `null` to visible long after
    mount (diagnostics, once trust is granted) — so a prune that changes anything
    asks for a re-measure through this ref. On mount that call lands before
    `useOverflow` has installed its own `measure`, and is a deliberate no-op:
    the hook's own first measurement follows immediately, against pruned DOM.
  */
  const remeasure = useRef<() => void>(() => {});
  useSeparatorPruning(leftRef, centerRef, rightRef, remeasure);
  const overflow = useOverflow(ref);
  remeasure.current = overflow.remeasure;
  const density = overflow.density;

  const byZone = Object.fromEntries(
    ZONES.map((zone) => [zone, collapseFor(zoneSegments(zone), density)]),
  ) as Record<StatusZone, CollapseResult>;

  // Concatenated in zone order rather than re-sorted globally: priority is
  // only ever compared within a zone (segments.ts's own rule), so there is no
  // single cross-zone ranking to sort by — each zone's own segments already
  // arrive priority-ascending from `collapseFor`.
  const overflowing = ZONES.flatMap((zone) => byZone[zone].collapsed);

  const renderZone = (zone: StatusZone) =>
    withSeparators(byZone[zone].visible).map((item) =>
      item.kind === 'separator' ? (
        <StatusSeparator key={item.id} />
      ) : (
        <item.segment.El key={item.segment.id} />
      ),
    );

  return (
    <footer
      ref={ref}
      data-testid="status-bar"
      data-density={density}
      className="grid h-6 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-t border-border bg-card/50 px-3 text-xs text-muted-foreground"
    >
      {/*
        Mounted directly here, not through `STATUS_SEGMENTS` — at `collapsed`
        density `collapseFor` moves an entire zone's segments into
        `OverflowPopover`, which only mounts its children while open, so a
        live region living inside `op-progress`/`in-progress` themselves would
        go silent in exactly the narrow-window state where the visual readout
        is hardest to notice. Living here instead, the announcement survives
        every density.
      */}
      <OpProgressLiveRegion />
      <InProgressLiveRegion />
      <div
        ref={leftRef}
        data-testid="status-bar-left"
        className="flex items-center justify-self-start gap-3 whitespace-nowrap [&>*]:shrink-0"
      >
        {renderZone('left')}
      </div>
      <div
        ref={centerRef}
        data-testid="status-bar-center"
        className="flex items-center justify-self-center gap-3 whitespace-nowrap [&>*]:shrink-0"
      >
        {renderZone('center')}
      </div>
      <div
        ref={rightRef}
        data-testid="status-bar-right"
        className="flex items-center justify-self-end gap-2 whitespace-nowrap [&>*]:shrink-0"
      >
        {renderZone('right')}
        <OverflowPopover items={overflowing} density={density} />
      </div>
    </footer>
  );
}
