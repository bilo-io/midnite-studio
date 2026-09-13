import type { CSSProperties } from 'react';

/**
 * Grok's bot mark, as a local SVG.
 *
 * A circle with two tilted capsule cutouts ("eyes").
 *
 * Built as a single path with `fillRule="evenodd"` and `fill="currentColor"`,
 * ensuring the two capsules are true transparent cutouts through which the
 * background shows, while the circle always renders in the surrounding text color.
 *
 * `style` is accepted and forwarded, but `color` is deliberately omitted so
 * that caller-passed brand accents (such as xAI's `#000000`) do not turn the
 * circle black against dark surfaces.
 */
export function GrokIcon({
  className,
  style,
}: {
  className?: string;
  strokeWidth?: number;
  /**
   * Accepted for layout/opacity styles; any `color` is ignored so the mark
   * always tracks the ambient text color.
   */
  style?: CSSProperties;
}) {
  const { color: _ignored, ...restStyle } = style ?? {};

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      style={restStyle}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fillRule="evenodd"
        d="M 12 2 A 10 10 0 1 0 12 22 A 10 10 0 1 0 12 2 Z M 12.874 7.306 L 13.707 8.991 A 0.821 0.821 0 0 0 15.18 8.264 L 14.347 6.579 A 0.821 0.821 0 0 0 12.874 7.306 Z M 17.324 6.178 L 18.356 8.265 A 0.597 0.597 0 0 0 19.426 7.736 L 18.394 5.649 A 0.597 0.597 0 0 0 17.324 6.178 Z"
      />
    </svg>
  );
}
