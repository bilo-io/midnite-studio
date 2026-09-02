/**
 * How much of itself a bar can afford to show. Lives in `lib/` rather than
 * under `features/status-bar/`, where it was written, because two bars decide
 * this now: the status bar (`features/status-bar/use-overflow.ts`) and the
 * title bar's agent cluster (`components/use-titlebar-density.ts`). The
 * decision is the same pure function in both; only the element being measured
 * and the thing that gives way differ.
 *
 * The status bar is wider than it was (Phase 27 Theme A), which is not the same
 * as being wide enough — the repositories panel goes to 560px
 * (`LAYOUT_BOUNDS.reposWidth`) and a narrow window plus several segments still
 * clips. The title bar has the sharper version of the same problem:
 * `@bilo-io/shell` gives both of its slots `shrink-0`, so a bar over budget
 * does not squeeze, it pushes its last control off the right edge of the
 * window.
 *
 * `full`: labels and chord hints shown. `compact`: icon-only. `collapsed`:
 * even icon-only does not fit, so the lowest-priority segments move into the
 * shared overflow popover (see `collapseFor` below) — or, in the title bar,
 * the readout that has somewhere else to be read drops out.
 */
export type Density = 'full' | 'compact' | 'collapsed';

export type WidthSample = {
  /** The bar's own `clientWidth` — what there is. */
  available: number;
  /** The bar's `scrollWidth` with every segment showing its label — what full wants. */
  fullWidth: number;
  /** The bar's `scrollWidth` with every segment icon-only — what compact wants. */
  compactWidth: number;
};

const HYSTERESIS = 24;

/**
 * Pure: no DOM, no hook, no observer. Every threshold and the hysteresis band
 * live here so they are testable with plain numbers (see `density.test.ts`).
 *
 * Collapse the instant content overflows; restore only once there is 24px
 * more room than the restore needs. `current` is a parameter precisely so the
 * band can be asymmetric — a function of width alone cannot express
 * hysteresis. 24px is one `h-6` bar height, chosen so the band is legible in
 * the code rather than arbitrary. A debounce was rejected: it would make the
 * bar visibly lag a splitter drag, compounding with the panel slide's own
 * 200ms into something that visibly trails the pointer.
 */
export function densityFor(m: WidthSample, current: Density): Density {
  const { available, fullWidth, compactWidth } = m;

  const canBeFull = current === 'full' ? available >= fullWidth : available >= fullWidth + HYSTERESIS;
  if (canBeFull) return 'full';

  const canBeCompact =
    current === 'collapsed' ? available >= compactWidth + HYSTERESIS : available >= compactWidth;
  if (canBeCompact) return 'compact';

  return 'collapsed';
}

export type CollapsibleSegment = { id: string; priority: number };

/**
 * Given a zone's segments and the bar's density, which stay inline and which
 * move to the shared overflow popover.
 *
 * `collapsed` is the only density that removes anything — `full`/`compact`
 * differ only in whether a segment's own label renders (a CSS concern, driven
 * by `data-density` on the bar; see `styles.css`), never in which segments
 * exist. At `collapsed`, icon-only itself does not fit, so the entire zone
 * moves into the popover rather than picking a partial subset: there is no
 * per-segment width available to this pure function (widths live in the DOM,
 * this does not), and a zone that cannot fit its icons has no principled
 * halfway point to stop at. `priority` still orders the result — ascending,
 * least-important first — so the popover lists the segments a narrowing
 * window sheds first at the top, and so a future partial-collapse could read
 * the same order without a second sort.
 */
export function collapseFor<T extends CollapsibleSegment>(
  segments: readonly T[],
  density: Density,
): { visible: T[]; collapsed: T[] } {
  if (density !== 'collapsed') return { visible: [...segments], collapsed: [] };
  const collapsed = [...segments].sort((a, b) => a.priority - b.priority);
  return { visible: [], collapsed };
}
