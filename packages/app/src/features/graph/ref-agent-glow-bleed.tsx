import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * The agent-session halo, portalled past the two clipping ancestors a ref
 * badge sits inside — the BRANCH/TAG cell's `overflow-hidden` and each
 * virtualized row's own `transform` (a containing block AND a stacking
 * context for anything `fixed`), the identical pair `SyncOverlay`
 * (`ref-badge.tsx`) and `RefAgentAvatar` (`ref-agent-avatar.tsx`) already
 * document and route around.
 *
 * In-row, `.ref-badge-agent-glow`'s `box-shadow` pulse is inherently
 * symmetric — CSS paints a shadow's blur on all four sides equally — but a
 * ref badge sits in a row barely taller than the chip itself, so most of
 * that blur had nowhere to go: clipped down to whatever sliver of padding
 * the row's own line-height left around the chip, which read as a thin
 * stripe down the chip's sides rather than a halo around the whole thing.
 * This element is the same halo — same identity colour, same
 * `ref-badge-agent-glow-pulse` keyframe (`styles.css`) — sized and
 * positioned from the real chip's `getBoundingClientRect()` and painted at
 * `document.body`, where nothing clips it and the blur can spend its full
 * radius bleeding into the rows above and below.
 *
 * Repositioned rather than closed on scroll/resize — `SyncOverlay` and
 * `RefAgentAvatar`'s hover strip both close instead, because those are
 * ephemeral, hover-triggered popovers with an obvious next trigger to
 * reopen them. This is a standing "an agent is live here" signal for as
 * long as the session is, so making it flicker out on every scroll tick
 * would read as the glow breaking rather than a deliberate dismissal.
 * Recompute is `requestAnimationFrame`-throttled to at most once per frame.
 *
 * No fill of its own, `pointer-events: none` — it paints only the halo
 * (`box-shadow`, which never touches the box's own interior) around an
 * otherwise fully transparent, exactly-chip-sized box, so it can sit on top
 * of the real chip (portalled content paints after everything already in
 * the DOM) without ever obscuring the branch name or the ahead/behind
 * counts under it. Contrast is never a function of glow intensity: the
 * readable layer and the glowing layer are two different elements.
 */
export function RefAgentGlowBleed({
  anchor,
  active,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  active: boolean;
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
      className="ref-badge-agent-glow-bleed pointer-events-none fixed z-[46] rounded-[3px]"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    />,
    document.body,
  );
}
