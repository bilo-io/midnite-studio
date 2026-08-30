import type { CSSProperties } from 'react';

/**
 * Aider's mark, as a local SVG.
 *
 * Stylized Aider 'A' terminal pair-programmer mark.
 */
export function AiderIcon({
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
      <path d="M12 2L2 22h4.5l2.1-4.5h6.8l2.1 4.5H22L12 2zm0 5.2l2.4 5.3H9.6L12 7.2zM4 4h4v2H4V4zm12 0h4v2h-4V4z" />
    </svg>
  );
}
