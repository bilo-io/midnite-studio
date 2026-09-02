/**
 * The thin rule between two clusters of the status bar.
 *
 * Was `right-delimiter.tsx`, a segment *registered in the middle of
 * `STATUS_SEGMENTS`* — a hand-placed `<div>` masquerading as a readout, which
 * worked only because the one place it was needed happened to be a fixed
 * position in a fixed list. Phase 39 needs three of them across two zones and
 * needs them to disappear when the cluster beside them has nothing to say, so
 * placement moved into the data (`StatusSegment.group`) and the markup stayed
 * here.
 *
 * `data-status-sep` is how [`status-bar.tsx`](./status-bar.tsx) picks these out
 * of a zone's live children to decide which ones are stranded — see
 * [`segments-groups.ts`](./segments-groups.ts). No display utility on purpose:
 * the UA's `[hidden] { display: none }` has to be able to win.
 */
export function StatusSeparator() {
  return (
    <div
      className="h-3 w-px shrink-0 bg-border"
      aria-hidden
      data-status-sep
      data-testid="status-separator"
    />
  );
}
