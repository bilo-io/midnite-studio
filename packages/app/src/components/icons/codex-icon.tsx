import type { CSSProperties } from 'react';

/**
 * Codex's mark, as a local SVG.
 *
 * **Provenance.** OpenAI's own mark is a trademark and its geometry — an
 * interlocking hexagonal knot — is also the wrong shape for this: it turns to
 * mud at the 14px the session list draws at, which is the failure the Phase 19
 * spinner rewrite already paid for once. So this is an original `</>` instead:
 * unmistakably "the coding agent", legible at a third of its design size, and
 * nobody's logo.
 *
 * Same shape as `claude-icon.tsx`: `viewBox="0 0 24 24"`, `fill="currentColor"`
 * so the session list can tint it with the agent's accent, `aria-hidden`, and
 * `strokeWidth` accepted and ignored.
 *
 * The three shapes are drawn as straight-edged polygons rather than stroked
 * paths, so the chevrons keep crisp corners at small sizes instead of the
 * rounded mush a scaled-down stroke gives.
 */
export function CodexIcon({
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
      <path d="M8.6 5.8 10.2 7.4 5.6 12l4.6 4.6-1.6 1.6L2.4 12Z" />
      <path d="M12.8 4.6 14.5 5.1 11.2 19.4 9.5 18.9Z" />
      <path d="M15.4 5.8 13.8 7.4 18.4 12l-4.6 4.6 1.6 1.6L21.6 12Z" />
    </svg>
  );
}
