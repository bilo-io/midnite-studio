import type { CSSProperties } from 'react';

/**
 * Lucide's `circle-pile` glyph, as a local SVG.
 *
 * **Why local.** `circle-pile` is not in the installed `react-icons@5.7.0`'s
 * `lu` set (the latest stable release, `6.0.0` being beta-only) — it's a
 * Lucide icon newer than that set's snapshot. CLAUDE.md's escape hatch for
 * exactly this case is a hand-held mark beside the set glyphs, matching the
 * structural `IconComponent` type rather than react-icons' own `IconType`.
 *
 * **Provenance.** Path data copied verbatim from Lucide's own source
 * (`icons/circle-pile.svg`, ISC licence), six two-radius circles. Rendered
 * stroke-based with `fill="none"`, matching how `react-icons/lu` itself
 * renders every glyph in this set — not a filled approximation.
 */
export function CirclePileIcon({
  className,
  strokeWidth = 2,
  style,
}: {
  className?: string;
  /**
   * `string | number`, matching react-icons' `IconBaseProps` rather than the
   * app's narrower `IconComponent` type — `VIEW_ICON` is typed
   * `Record<ViewId, IconType>`, so this mark has to satisfy that wider shape
   * to stand in for a set glyph there.
   */
  strokeWidth?: number | string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="19" r="2" />
      <circle cx="12" cy="5" r="2" />
      <circle cx="16" cy="12" r="2" />
      <circle cx="20" cy="19" r="2" />
      <circle cx="4" cy="19" r="2" />
      <circle cx="8" cy="12" r="2" />
    </svg>
  );
}
