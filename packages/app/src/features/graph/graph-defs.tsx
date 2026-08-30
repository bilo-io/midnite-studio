import { AvatarClipPath } from './commit-avatar';
import type { GraphTheme } from './graph-themes';
import { laneColors } from './lane-colors';

/** Stable id for the avatar clip of a given style. */
export const avatarClipId = (theme: GraphTheme): string => `mstudio-avatar-clip-${theme.id}`;

/**
 * The SVG definitions every row in the list shares.
 *
 * Rendered ONCE, above the virtualized rows — not inside `GraphSvg`. An
 * arrowhead marker and an avatar clip path defined per row would be 50 000
 * duplicate definitions for a large repo, all identical, and markers cannot be
 * given a colour at the point of use: SVG resolves `markerEnd` against a
 * document-level id, so one marker per lane colour is the only way to get an
 * arrowhead that matches the line it terminates.
 */
export function GraphDefs({ theme }: { theme: GraphTheme }) {
  return (
    <svg width={0} height={0} aria-hidden className="absolute">
      <defs>
        {/*
          Omitted for a `dot` style, whose `avatarSize` is 0 — a clip circle of
          radius 0 clips away everything it is applied to, and leaving one
          defined invites exactly that bug the first time somebody wires a dot
          style to something that consumes the clip.
        */}
        {theme.node === 'avatar' ? (
          <AvatarClipPath id={avatarClipId(theme)} size={theme.avatarSize} />
        ) : null}
        {theme.arrowheads
          ? laneColors(theme.palette).map((color, index) => (
              <marker
                key={index}
                id={`mstudio-arrow-${index}-${theme.id}`}
                viewBox="0 0 8 8"
                refX={7}
                refY={4}
                markerWidth={6}
                markerHeight={6}
                orient="auto-start-reverse"
                // `userSpaceOnUse` keeps the head a fixed size instead of
                // scaling with strokeWidth, which at 3px would produce a
                // spearhead wider than the lane spacing.
                markerUnits="userSpaceOnUse"
              >
                <path d="M 0 0 L 8 4 L 0 8 z" fill={color} />
              </marker>
            ))
          : null}
      </defs>
    </svg>
  );
}
