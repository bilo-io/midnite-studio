import { useEffect, useLayoutEffect, useState } from 'react';
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
 * Repositioned rather than closed on scroll/resize — `SyncOverlay` and
 * `RefAgentAvatar`'s hover strip both close instead, because those are
 * ephemeral, hover-triggered popovers with an obvious next trigger to
 * reopen them. This is a standing "an agent is live here" signal for as
 * long as the session is, so making it flicker out on every scroll tick
 * would read as the glow breaking rather than a deliberate dismissal.
 * Recompute is `requestAnimationFrame`-throttled to at most once per frame.
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
 */
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
  const [rect, setRect] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!active) {
      setRect(null);
      return;
    }
    const node = anchor.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    setRect({ x: box.left, y: box.top, width: box.width, height: box.height });
  }, [active, anchor]);

  useEffect(() => {
    if (!active) return;
    const node = anchor.current;
    if (!node) return;
    let raf = 0;
    const reposition = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const box = node.getBoundingClientRect();
        setRect({ x: box.left, y: box.top, width: box.width, height: box.height });
      });
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [active, anchor]);

  if (!active || !rect) return null;

  return createPortal(
    <span
      aria-hidden
      data-testid="ref-agent-glow-bleed"
      className="ref-badge-agent-arc-glow pointer-events-none fixed z-[46] rounded-[3px]"
      style={{ ...laneVars(colorIdx, palette), left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    />,
    document.body,
  );
}
