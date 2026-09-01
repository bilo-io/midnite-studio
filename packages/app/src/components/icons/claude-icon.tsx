import type { CSSProperties } from 'react';

/**
 * Claude's mark, as a local SVG.
 *
 * Neither `@bilo-io/ui` nor lucide ships one — lucide is a line-icon set and
 * deliberately carries no third-party logos — so it lives here alongside
 * `brand.tsx`, the app's other hand-held mark.
 *
 * Typed to the app's structural `IconComponent` (`className` + `strokeWidth`)
 * rather than to react-icons' `IconType`, so it drops into `IconButton` and the
 * session list next to `LuTerminal` without either caring where it came from.
 * `strokeWidth` is accepted and ignored: the mark is filled, not stroked, and
 * a caller mapping over a list of icons should not have to special-case it.
 *
 * `currentColor` on the fill is what lets the session list tint it with the
 * agent's own accent from the roster instead of a hard-coded orange.
 */
export function ClaudeIcon({
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
      <path d="M4.71 15.48l4.4-2.47.07-.21-.07-.12h-.21l-.72-.05-2.45-.06-2.13-.09-2.06-.11-.52-.11L0 11.6l.05-.32.44-.29.62.05 1.38.1 2.07.14 1.5.09 2.22.23h.35l.05-.14-.12-.09-.09-.09-2.16-1.46-2.33-1.55-1.22-.89-.66-.45-.34-.42-.14-.94.61-.67.82.06.21.06.83.64 1.78 1.38 2.33 1.71.34.28.14-.1.02-.07-.15-.26L8.01 6.7 6.7 4.44l-.58-.94-.16-.56a2.7 2.7 0 01-.09-.66l.7-.95L7.15 1l.93.13.39.34.58 1.32.94 2.09 1.45 2.84.43.84.23.78.08.24h.15v-.14l.12-1.63.22-2 .22-2.58.07-.72.36-.87.71-.47.56.27.46.65-.06.42-.28 1.8-.54 2.8-.35 1.88h.2l.24-.23.96-1.28 1.62-2.02.71-.8.84-.9.54-.42h1.02l.75 1.11-.34 1.15-1.05 1.33-.87 1.13-1.25 1.68-.78 1.35.07.11.19-.02 2.79-.6 1.51-.27 1.8-.31.81.38.09.39-.32.79-1.93.48-2.26.45-3.37.8-.04.03.05.06 1.51.14.65.04h1.59l2.96.22.77.51.46.63-.08.47-1.19.6-1.61-.38-3.74-.89-1.29-.32h-.18v.11l1.08 1.05 1.97 1.78 2.47 2.29.13.57-.32.45-.34-.05-2.2-1.65-.85-.75-1.92-1.62h-.13v.17l.44.65 2.34 3.52.12 1.08-.17.35-.61.21-.67-.12-1.37-1.93-1.42-2.17-1.14-1.95-.14.08-.67 7.25-.32.37-.72.28-.6-.46-.32-.74.32-1.46.38-1.9.31-1.51.28-1.88.17-.62-.01-.04-.14.02-1.4 1.92-2.13 2.88-1.69 1.8-.4.16-.7-.36.06-.65.4-.58 2.33-2.97.35-.46-.02-.07h-.03l-3.98 2.58-.71.09-.3-.29.04-.46.14-.15 1.16-.8z" />
    </svg>
  );
}
