import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { densityFor, type Density } from '../../lib/density';

type ZoneWidths = { fullWidth: number; compactWidth: number };
type ZoneKey = 'left' | 'center' | 'right';
export type ZoneDensities = Record<ZoneKey, Density>;

/** Stamp `full`/`compact` on the zone itself and read ITS OWN `scrollWidth`
 * — not the footer's — so the reading is that zone's natural content width,
 * independent of whatever box the grid happens to have given it. Zones stay
 * shrink-to-fit (`justify-self-*` in `status-bar.tsx`, no `min-w-0`)
 * precisely so this is true: a shrink-to-fit element's `scrollWidth` already
 * equals its content's width, with nothing to clip.
 */
function measureZone(el: HTMLElement): ZoneWidths {
  const restore = el.dataset.density;
  el.dataset.density = 'full';
  const fullWidth = el.scrollWidth;
  el.dataset.density = 'compact';
  const compactWidth = el.scrollWidth;
  el.dataset.density = restore;
  return { fullWidth, compactWidth };
}

function widthAt(density: Density, widths: ZoneWidths): number {
  if (density === 'collapsed') return 0;
  return density === 'full' ? widths.fullWidth : widths.compactWidth;
}

/**
 * How much of itself each of the status bar's three zones can afford to
 * show — decided per zone, but not symmetrically (Phase 87).
 *
 * Before this, one `useOverflow` measured the whole `<footer>` as a single
 * `scrollWidth` and every zone shared its one `data-density`. Phase 27
 * through Phase 84 grew the right zone considerably (finance, monitor, repo
 * verdicts, alerts); once its own content plus the rail's exceeded the bar,
 * that shared measurement tipped the *entire bar* into `compact` — which
 * hides a rail toggle's chord and name unconditionally — even though the
 * left zone's own seven toggles would have fit in the bar's available width
 * on their own. That coupling, not any one segment, was the bug: a busy
 * right zone could make the rail illegible with room to spare beside it.
 *
 * The fix is a priority order, not three independent measurements against
 * an equal split of the bar. `1fr`/`1fr` grid columns divide space evenly
 * regardless of what each side actually needs, so pinning each zone's own
 * `clientWidth` to that even split (via `min-w-0`) would only move the same
 * bug to a fixed 50/50 ratio — a crowded right zone would stop starving the
 * rail and start starving it by exactly half, every time, even when the
 * rail alone would have fit easily. Left and centre are instead measured
 * against the bar's *whole* budget (`available`), as if each were the only
 * thing in it; right then gets whatever is left after subtracting what left
 * and centre actually rendered at the density that decision produced. The
 * rail (left) and the progress readouts (centre) are protected this way;
 * the machine's vitals and the repo's alerts (right) are what absorbs a
 * narrow window — matching where this bar already put its "outer corner,
 * highest-attention position" reasoning in `segments.ts`, just applied one
 * step earlier, before those segments are even measured.
 *
 * Each zone gets its own `densityFor` hysteresis (`current` fed back per
 * zone) and its own `lastWidths` cache, for the reason the retired
 * `useOverflow` documented: at `collapsed` a zone's segments are gone from
 * the DOM (`collapseFor`), so re-measuring would read the empty set's
 * width, not what restoring would actually need. `ResizeObserver` watches
 * only the footer, not each zone — the external signal that changes is the
 * bar's own available width (a window resize, a panel opening); a zone's
 * own content changing size is a React re-render, which `remeasure` (driven
 * by `status-bar.tsx`'s separator pruning) already covers.
 */
export function useZoneDensities(
  footerRef: RefObject<HTMLElement | null>,
  leftRef: RefObject<HTMLDivElement | null>,
  centerRef: RefObject<HTMLDivElement | null>,
  rightRef: RefObject<HTMLDivElement | null>,
): { densities: ZoneDensities; remeasure: () => void } {
  const [densities, setDensities] = useState<ZoneDensities>({
    left: 'full',
    center: 'full',
    right: 'full',
  });
  const densitiesRef = useRef(densities);
  densitiesRef.current = densities;

  const lastWidths = useRef<Record<ZoneKey, ZoneWidths | null>>({
    left: null,
    center: null,
    right: null,
  });

  const measureRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const footerEl = footerRef.current;
    const leftEl = leftRef.current;
    const centerEl = centerRef.current;
    const rightEl = rightRef.current;
    if (!footerEl || !leftEl || !centerEl || !rightEl) return;

    const els: Record<ZoneKey, HTMLElement> = { left: leftEl, center: centerEl, right: rightEl };

    const widthsFor = (key: ZoneKey, current: Density): ZoneWidths => {
      if (current === 'collapsed' && lastWidths.current[key]) return lastWidths.current[key]!;
      const widths = measureZone(els[key]);
      lastWidths.current[key] = widths;
      return widths;
    };

    const measure = () => {
      const available = footerEl.clientWidth;
      const current = densitiesRef.current;

      const leftWidths = widthsFor('left', current.left);
      const centerWidths = widthsFor('center', current.center);
      const rightWidths = widthsFor('right', current.right);

      const nextLeft = densityFor(
        { available, fullWidth: leftWidths.fullWidth, compactWidth: leftWidths.compactWidth },
        current.left,
      );
      const nextCenter = densityFor(
        { available, fullWidth: centerWidths.fullWidth, compactWidth: centerWidths.compactWidth },
        current.center,
      );

      const reserved = widthAt(nextLeft, leftWidths) + widthAt(nextCenter, centerWidths);
      const rightAvailable = Math.max(0, available - reserved);
      const nextRight = densityFor(
        { available: rightAvailable, fullWidth: rightWidths.fullWidth, compactWidth: rightWidths.compactWidth },
        current.right,
      );

      if (nextLeft !== current.left || nextCenter !== current.center || nextRight !== current.right) {
        setDensities({ left: nextLeft, center: nextCenter, right: nextRight });
      }
    };

    measureRef.current = measure;
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(footerEl);
    return () => {
      observer.disconnect();
      measureRef.current = () => {};
    };
  }, [footerRef, leftRef, centerRef, rightRef]);

  const remeasure = useCallback(() => measureRef.current(), []);

  return { densities, remeasure };
}
