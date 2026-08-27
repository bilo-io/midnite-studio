import type { CSSProperties } from 'react';

/**
 * Antigravity's mark, as a local SVG.
 *
 * **Provenance.** Drawn here rather than lifted: Antigravity is a Google
 * product and its logo is a trademark, so this is an *original* mark for the
 * agent's roster entry — a mass leaving a ground line, which is what the name
 * says — and not a copy of anything shipped by the project. `INITIAL_PLAN.md`'s
 * rule is that a third-party asset's licence gets written down where the asset
 * lands; the cheaper way to satisfy it is not to take the asset.
 *
 * Same shape as `claude-icon.tsx` in every other respect: `viewBox="0 0 24 24"`,
 * `fill="currentColor"` so the session list can tint it with the agent's own
 * accent, `aria-hidden`, and `strokeWidth` accepted and ignored — the mark is
 * filled, not stroked, and a caller mapping over a list of icons should not
 * have to special-case it.
 *
 * Two shapes, not one path, because the gap between the arrow and the bar is
 * the whole idea and a 14px row will not read a subtler version of it.
 */
export function AntigravityIcon({
  className,
  style,
}: {
  className?: string;
  strokeWidth?: number;
  /** Carries the agent's accent, which is roster data rather than a class. */
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      style={style}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {/* The mass: a blunt arrow, wide enough to hold its silhouette at 14px. */}
      <path d="M12 2.6c.42 0 .82.19 1.09.52l6.3 7.87a1.4 1.4 0 0 1-1.09 2.27h-2.9v2.24c0 .72-.58 1.3-1.3 1.3H9.9c-.72 0-1.3-.58-1.3-1.3v-2.24H5.7a1.4 1.4 0 0 1-1.09-2.27l6.3-7.87c.27-.33.67-.52 1.09-.52Z" />
      {/* The ground it has left. */}
      <rect x="3.4" y="19.1" width="17.2" height="2.3" rx="1.15" />
    </svg>
  );
}
