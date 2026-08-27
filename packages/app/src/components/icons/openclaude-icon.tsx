import type { CSSProperties } from 'react';

/**
 * OpenClaude's mark, as a local SVG.
 *
 * **Provenance.** The project publishes a **wordmark only** —
 * `docs/assets/openclaude-wordmark.png` — so there is no official square asset
 * to use and this mark is *derived* rather than copied: the radiating burst of
 * the Claude lineage it names itself after, with one ray deliberately absent.
 * The gap is the whole point, and it is doing two jobs at once — it says
 * "open", and it is what keeps this from reading as Claude's mark in a session
 * list where the two sit two rows apart. `INITIAL_PLAN.md` establishes that a
 * third-party asset's licence gets written down where the asset lands; this is
 * that note, and the answer is that no third-party asset landed.
 *
 * Same shape as `claude-icon.tsx`: `viewBox="0 0 24 24"`,
 * `fill="currentColor"` so the session list can tint it with the agent's
 * accent, `aria-hidden`, and `strokeWidth` accepted and ignored.
 *
 * Five rays as rotated capsules rather than one traced path: the geometry IS
 * the idea here, and a hand-traced blob would make "which ray is missing"
 * impossible to answer when the sixth one eventually needs adding back.
 */
export function OpenClaudeIcon({
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
      {/*
        Six positions, 60° apart; 300° — the upper right — is the one left out.
        Each ray runs from radius 3.4 to 10.5, which leaves a hole at the centre
        the dot below fills; without it the mark loses its weight at 14px and
        reads as five unrelated slivers.
      */}
      {[0, 60, 120, 180, 240].map((angle) => (
        <rect
          key={angle}
          x="10.85"
          y="1.5"
          width="2.3"
          height="7.1"
          rx="1.15"
          transform={`rotate(${angle} 12 12)`}
        />
      ))}
      <circle cx="12" cy="12" r="1.7" />
    </svg>
  );
}
