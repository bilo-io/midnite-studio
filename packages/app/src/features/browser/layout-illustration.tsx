import { useId } from 'react';

import type { BrowserLayout } from '../../store/ui-store';

/**
 * A small drawing of what a browser layout does to the window.
 *
 * The launcher's whole job is to answer "where will it go?" before the pane
 * moves, and three words cannot do that — "Full screen" reads the same
 * whether or not the nav rail survives it, which is exactly the difference
 * the user is choosing between. So each option carries a diagram of the
 * window: the rail down the left, the footer along the bottom, the browser
 * half filled in and the workspace half drawn as text lines.
 *
 * Deliberately schematic rather than a screenshot. The three shapes differ
 * only in which region the fill covers, so the eye compares them in one pass
 * — and the same drawing shrinks to 20px for the toolbar's picker without
 * becoming mush.
 */
export function BrowserLayoutIllustration({
  layout,
  className,
}: {
  layout: BrowserLayout;
  className?: string;
}) {
  // `useId` because the clip path is referenced by id, and three of these
  // render side by side in the launcher (plus three more in the toolbar).
  const clipId = `browser-layout-clip-${useId()}`;

  const RAIL_W = 9;
  const FOOTER_Y = 37;
  const W = 64;
  // The split halves the room LEFT OF THE FOOTER AND RIGHT OF THE RAIL, which
  // is what the side-by-side layouts actually divide.
  const SPLIT = RAIL_W + (W - RAIL_W) / 2;

  /** Where the browser sits: full screen ignores the rail entirely. */
  const browser =
    layout === 'full'
      ? { x: 0, width: W }
      : layout === 'left'
        ? { x: RAIL_W, width: SPLIT - RAIL_W }
        : { x: SPLIT, width: W - SPLIT };

  /** The workspace half — absent in full screen, which covers it. */
  const workspace =
    layout === 'full'
      ? null
      : layout === 'left'
        ? { x: SPLIT, width: W - SPLIT }
        : { x: RAIL_W, width: SPLIT - RAIL_W };

  return (
    <svg
      viewBox={`0 0 ${W} 44`}
      className={className}
      // Decorative: every option's own label and description already say what
      // this draws, so a second announcement of it is noise on a screen reader.
      aria-hidden
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={W} height="44" rx="3.5" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        {/* The window itself. */}
        <rect x="0" y="0" width={W} height="44" className="fill-card" />

        {/* The nav rail — drawn first, so full screen simply paints over it. */}
        <rect
          x="0"
          y="0"
          width={RAIL_W}
          height={FOOTER_Y}
          className="fill-muted-foreground/25"
        />
        {[7, 14, 21].map((y) => (
          <rect
            key={y}
            x="3"
            y={y}
            width="3"
            height="3"
            rx="1"
            className="fill-muted-foreground/60"
          />
        ))}

        {/* The workspace half: a stack of text lines, i.e. the view you keep. */}
        {workspace ? (
          <g>
            {[8, 14, 20, 26].map((y, index) => (
              <rect
                key={y}
                x={workspace.x + 4}
                y={y}
                width={workspace.width - 8 - (index % 2 === 1 ? 6 : 0)}
                height="2"
                rx="1"
                className="fill-muted-foreground/45"
              />
            ))}
          </g>
        ) : null}

        {/* The browser: a filled region under its own address bar. */}
        <rect
          x={browser.x}
          y="0"
          width={browser.width}
          height={FOOTER_Y}
          className="fill-primary/25"
        />
        <rect
          x={browser.x}
          y="0"
          width={browser.width}
          height="8"
          className="fill-primary/45"
        />
        <rect
          x={browser.x + 3}
          y="3"
          width={Math.max(4, browser.width - 6)}
          height="2"
          rx="1"
          className="fill-primary"
        />

        {/*
          The footer, last and never covered — the one strip a full-screen
          browser deliberately leaves alone, and the reason it is drawn on top
          of the browser fill rather than beside it.
        */}
        <rect x="0" y={FOOTER_Y} width={W} height={44 - FOOTER_Y} className="fill-muted" />
        <rect
          x="3"
          y={FOOTER_Y + 2.5}
          width="18"
          height="2"
          rx="1"
          className="fill-muted-foreground/60"
        />

        <rect
          x="0.5"
          y="0.5"
          width={W - 1}
          height="43"
          rx="3.5"
          fill="none"
          strokeWidth="1"
          className="stroke-border"
        />
      </g>
    </svg>
  );
}
