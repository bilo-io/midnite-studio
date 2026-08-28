import { STATUS_SEGMENTS, type StatusZone } from './segments';

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
 */
function zoneSegments(zone: StatusZone) {
  return STATUS_SEGMENTS.filter((s) => s.zone === zone);
}

export function StatusBar() {
  return (
    <footer
      data-testid="status-bar"
      className="grid h-6 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-t border-border bg-card/50 px-3 text-xs text-muted-foreground"
    >
      <div data-testid="status-bar-left" className="flex items-center justify-self-start gap-3">
        {zoneSegments('left').map((s) => (
          <s.El key={s.id} />
        ))}
      </div>
      <div data-testid="status-bar-center" className="flex items-center justify-self-center gap-3">
        {zoneSegments('center').map((s) => (
          <s.El key={s.id} />
        ))}
      </div>
      {/*
        Diagnostics sits LEFT of the monitor within this zone: it is about
        this repository and belongs nearer the repository controls, while the
        machine's vitals stay hard against the window edge where they do not
        move as things are added. Phase 17's checks-verdict indicator slots in
        here too.
      */}
      <div data-testid="status-bar-right" className="flex items-center justify-self-end gap-3">
        {zoneSegments('right').map((s) => (
          <s.El key={s.id} />
        ))}
      </div>
    </footer>
  );
}
