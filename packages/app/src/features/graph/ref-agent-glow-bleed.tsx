import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import type { PaletteStyle } from './graph-themes';
import { laneVars } from './lane-colors';

/**
 * The agent-session halo, portalled past the two clipping ancestors a ref
 * badge sits inside — the BRANCH/TAG cell's `overflow-hidden` and each
 * virtualized row's own `transform` (a containing block AND a stacking
 * context for anything `fixed`), the identical pair `SyncOverlay`
 * (`ref-badge.tsx`) and `RefAgentAvatar` (`ref-agent-avatar.tsx`) already
 * document and route around.
 *
 * In-row, a symmetric halo — `box-shadow` blur painted on all four sides
 * equally — has nowhere to go in a row barely taller than the chip itself:
 * clipped down to whatever sliver of padding the row's own line-height left
 * around the chip, which read as a thin stripe down the chip's sides rather
 * than a halo around the whole thing. This element paints the same orbiting
 * arc `HeadGlow`'s in-row `.ref-badge-agent-arc-ring` does — same
 * `--arc-angle` orbit, same lane hue band, via the shared `.ref-badge-agent-
 * arc-glow` gradient in `styles.css` — sized and positioned from the real
 * chip's `getBoundingClientRect()` and painted at `document.body`, where
 * nothing clips it and the blur can spend its full radius bleeding into the
 * rows above and below.
 *
 * `colorIdx`/`palette` are this branch's lane colour — the same pair
 * `ref-badge.tsx` feeds `laneVars()` for the chip itself. The portal is NOT
 * a DOM descendant of the chip (it appends to `document.body` as a
 * sibling), so the `--lane-h/s/l` custom properties the chip sets via its
 * own inline style cannot cascade here; this component sets its own copy,
 * the same way `SyncOverlay` (`ref-badge.tsx`) already does for its strip.
 *
 * Where it portals: into the nearest `[data-graph-glow-layer]` ancestor when
 * there is one (the graph's virtualizer content div — see `GLOW_LAYER_ATTR`),
 * positioned `absolute` relative to it, and only to `document.body` as a
 * `fixed` fallback outside the graph. Either way it is repositioned rather
 * than closed — `SyncOverlay` and `RefAgentAvatar`'s hover strip both close
 * instead, because those are ephemeral, hover-triggered popovers. This is a
 * standing "an agent is live here" signal for as long as the session is.
 * Remeasures are `requestAnimationFrame`-throttled to at most once per frame,
 * driven by `ResizeObserver` on the chip and the layer, window resize, and —
 * in the body fallback only — scroll.
 *
 * The outer span itself stays fully transparent, exactly chip-sized and
 * `pointer-events: none` — the actual gradient paints on a `::before`
 * pseudo-element (`inset: -10px` in `styles.css`), so the bleed comes from
 * the pseudo's own larger box rather than from inflating this element's
 * measured rect, and this component's positioning contract (what
 * `ref-agent-glow-bleed.test.tsx` exercises) stays exactly the live chip's
 * own rect. It can sit on top of the real chip (portalled content paints
 * after everything already in the DOM) without ever obscuring the branch
 * name or the ahead/behind counts under it: contrast is never a function of
 * glow intensity, because the readable layer and the glowing layer are two
 * different elements.
 *
 * Stacking: positioned at `z-graph-glow` (1) — above ordinary in-flow graph
 * rows (0) so the halo bleeds into neighbouring rows, clipped by the graph
 * scroller like the rows themselves; in the body fallback it stays below
 * `data-terminal-frame` (`z-10`), splitters (`z-20`), the nav rail (`z-40`),
 * browser panes (`z-45`), menus (`z-80`), and popovers (`z-85`).
 */
/**
 * Opt-in attribute for the element the halo should live inside instead of
 * `document.body`. The graph sets it on the virtualizer's content div — the
 * positioned parent every row is translated within — which buys two things a
 * body-level `fixed` halo could not have:
 *
 * - **It moves with the chip by construction.** The rect is measured relative
 *   to the layer, and the layer and the row move together — on scroll, and on
 *   every layout shift that fires no scroll/resize event at all: the
 *   uncommitted/stash rows mounting above the scroller once status loads, the
 *   nav rail settling its width at launch. A viewport-fixed halo missed all
 *   of those and sat a row (and a rail's width) off-target until the next
 *   resize.
 * - **It is clipped by the scroller like every row is.** Scrolled up under the
 *   uncommitted/stash rows and the header — which sit above the scroller, not
 *   in it — the halo now goes behind them with its row instead of painting
 *   over them.
 */
export const GLOW_LAYER_ATTR = 'data-graph-glow-layer';

type GlowRect = { x: number; y: number; width: number; height: number };

function computeVisibleRect(node: HTMLElement, layer: HTMLElement | null): GlowRect | null {
  const box = node.getBoundingClientRect();
  // An unrendered element (e.g. display: none when the terminal maximizes) has
  // zero dimensions; do not portal a halo at (0, 0).
  if (box.width === 0 && box.height === 0) return null;

  if (layer) {
    // Inside the layer the scroller's own overflow clips the halo, so no
    // visibility culling is needed — only the offset from the layer's origin.
    const origin = layer.getBoundingClientRect();
    return { x: box.left - origin.left, y: box.top - origin.top, width: box.width, height: box.height };
  }

  // If inside the virtualised graph scroll container, hide the portalled halo
  // when the row is scrolled completely out of view (past top or bottom).
  const scrollParent = node.closest('[role="grid"]');
  if (scrollParent) {
    const scrollBox = scrollParent.getBoundingClientRect();
    // Allow a 12px bleed margin so halos on edge rows bleed naturally before vanishing.
    if (box.bottom < scrollBox.top - 12 || box.top > scrollBox.bottom + 12) {
      return null;
    }
  }

  return { x: box.left, y: box.top, width: box.width, height: box.height };
}

export function RefAgentGlowBleed({
  anchor,
  active,
  colorIdx,
  palette,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  active: boolean;
  /** Lane colour index of the ref this badge belongs to — see `laneVars`. */
  colorIdx: number;
  palette: PaletteStyle;
}) {
  const [placed, setPlaced] = useState<{ rect: GlowRect; layer: HTMLElement | null } | null>(null);

  useLayoutEffect(() => {
    if (!active) {
      setPlaced(null);
      return;
    }
    const node = anchor.current;
    if (!node) return;
    const layer = node.closest<HTMLElement>(`[${GLOW_LAYER_ATTR}]`);
    const measure = () => {
      const rect = computeVisibleRect(node, layer);
      setPlaced((prev) =>
        rect === null
          ? null
          : prev &&
              prev.layer === layer &&
              prev.rect.x === rect.x &&
              prev.rect.y === rect.y &&
              prev.rect.width === rect.width &&
              prev.rect.height === rect.height
            ? prev
            : { rect, layer },
      );
    };
    measure();

    let raf = 0;
    const reposition = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        measure();
      });
    };
    // Inside a layer, scrolling cannot change the offset — only the chip's or
    // the layer's own box changing can (a column resize, rows streaming in).
    if (!layer) window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reposition);
    observer?.observe(node);
    if (layer) observer?.observe(layer);
    return () => {
      if (!layer) window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      observer?.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [active, anchor]);

  if (!active || !placed) return null;
  const { rect, layer } = placed;

  return createPortal(
    <span
      aria-hidden
      data-testid="ref-agent-glow-bleed"
      className={`ref-badge-agent-arc-glow pointer-events-none ${layer ? 'absolute' : 'fixed'} z-graph-glow rounded-[3px]`}
      style={{ ...laneVars(colorIdx, palette), left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    />,
    layer ?? document.body,
  );
}
