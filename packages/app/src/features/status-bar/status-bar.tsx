import { useRef } from 'react';

import { collapseFor } from './density';
import { InProgressLiveRegion } from './in-progress';
import { OpProgressLiveRegion } from './op-progress';
import { OverflowPopover } from './overflow-popover';
import { STATUS_SEGMENTS, type StatusSegment, type StatusZone } from './segments';
import { useOverflow } from './use-overflow';

/**
 * The status bar: the panel toggles on the left and, since Phase 18, the
 * machine's vitals in the right half.
 *
 * It no longer repeats the checkout's git status — branch, ahead/behind and
 * the change count all live in the title bar, where the breadcrumb and the
 * sync cluster already say them. Two readings of the same thing, one at each
 * edge of the window, is one more place to disagree and no more information.
 *
 * Spans the full content area as of Phase 27 Theme A — mounted as a sibling of
 * the content row inside CONTENT_BOX, so the `border-t` runs under the
 * repositories panel too.
 *
 * Three-column grid as of Theme C — `grid-cols-[1fr_auto_1fr]` gives the
 * centre zone a true middle that cannot drift as the left zone's content
 * changes length, and the `auto` track collapses to zero width when nothing
 * is mounted there, so the left and right zones are not pushed inward by an
 * empty centre. Each zone maps `STATUS_SEGMENTS` directly —
 * `segments.map((s) => <s.El key={s.id} />)`, no wrapping element — because a
 * `<div>` around a segment that returns `null` still occupies a `gap-3` slot,
 * and five absent segments would be 60px of unexplained space.
 *
 * Theme E's overflow sits on top of that same array rather than a second
 * source of truth: `data-density` on this `<footer>` drives every segment's
 * own `.status-label` CSS (`styles.css`) — compact/collapsed hide it, full
 * does not — so a segment already using that class earns compact styling
 * for free, including every segment Theme D has not landed yet. `collapsed`
 * additionally removes a zone's segments from here and hands them to the one
 * shared `OverflowPopover`.
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

export function StatusBar() {
  const ref = useRef<HTMLElement | null>(null);
  const density = useOverflow(ref);

  const byZone = Object.fromEntries(
    ZONES.map((zone) => [zone, collapseFor(zoneSegments(zone), density)]),
  ) as Record<StatusZone, CollapseResult>;

  // Concatenated in zone order rather than re-sorted globally: priority is
  // only ever compared within a zone (segments.ts's own rule), so there is no
  // single cross-zone ranking to sort by — each zone's own segments already
  // arrive priority-ascending from `collapseFor`.
  const overflowing = ZONES.flatMap((zone) => byZone[zone].collapsed);

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
        data-testid="status-bar-left"
        className="flex items-center justify-self-start gap-3 whitespace-nowrap [&>*]:shrink-0"
      >
        {byZone.left.visible.map((s) => (
          <s.El key={s.id} />
        ))}
      </div>
      <div
        data-testid="status-bar-center"
        className="flex items-center justify-self-center gap-3 whitespace-nowrap [&>*]:shrink-0"
      >
        {byZone.center.visible.map((s) => (
          <s.El key={s.id} />
        ))}
      </div>
      {/*
        Diagnostics sits LEFT of the monitor within this zone: it is about
        this repository and belongs nearer the repository controls, while the
        machine's vitals stay hard against the window edge where they do not
        move as things are added. Phase 17's checks-verdict indicator slots in
        here too. The overflow trigger, when there is one, sits hard against
        the edge itself — the one control that is never optional.
      */}
      <div
        data-testid="status-bar-right"
        className="flex items-center justify-self-end gap-3 whitespace-nowrap [&>*]:shrink-0"
      >
        {byZone.right.visible.map((s) => (
          <s.El key={s.id} />
        ))}
        <OverflowPopover items={overflowing} density={density} />
      </div>
    </footer>
  );
}
