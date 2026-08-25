import { useSyncExternalStore } from 'react';

import type { AvatarState } from '../../services/avatars';
import {
  avatarFor,
  gravatarUrl,
  hueFor,
  initialsFor,
  markAvatarMissing,
  subscribeAvatars,
} from '../../services/avatars';

/**
 * The author's face, clipped into the commit node.
 *
 * Lives inside the row's existing SVG rather than as an HTML overlay so the node
 * keeps one element tree — z-order against the edges, and the merge/branch
 * geometry around it, stay exactly as they were.
 *
 * The generated fallback is the INITIAL state as well as the error state. A
 * circle that is empty until an image arrives makes the whole graph visibly pop
 * on first paint, and on a repo with no Gravatars it would never fill in.
 */
const SERVER_SNAPSHOT: AvatarState = { status: 'pending' };

export function CommitAvatar({
  email,
  name,
  cx,
  cy,
  size,
  ring,
  ringWidth,
  clipId,
}: {
  email: string;
  name: string;
  cx: number;
  cy: number;
  size: number;
  /** Lane colour, drawn as the ring around the face. */
  ring: string;
  ringWidth: number;
  /**
   * Shared per-theme clip id, defined once at the list level.
   *
   * Every avatar in a given style is the same size, so one `<clipPath>` serves
   * all of them — a per-row id would mean 50 000 identical defs, which is the
   * kind of thing that makes a virtualized list stop being virtual.
   */
  clipId: string;
}) {
  // `getServerSnapshot` is a module constant for the same reason `avatarFor`
  // returns a cached object: React compares snapshots by reference.
  const state = useSyncExternalStore(
    subscribeAvatars,
    () => avatarFor(email),
    () => SERVER_SNAPSHOT,
  );

  const radius = size / 2;
  const hue = hueFor(email);

  return (
    <g>
      {state.status === 'ready' ? (
        /*
          Translated so the image sits at the origin of its own space, which is
          the space the shared clipPath's circle is defined in. A userSpaceOnUse
          clip resolves against the user coordinate system in force where it is
          REFERENCED, so without this the one shared circle would only ever line
          up with a node in the first lane of the first row.
        */
        <g transform={`translate(${cx - radius} ${cy - radius})`}>
          <image
            // Built here, not cached, so the request tracks the ACTIVE style's
            // node size rather than whichever style happened to ask first.
            href={gravatarUrl(state.hash, size)}
            x={0}
            y={0}
            width={size}
            height={size}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
            // With `d=404` a miss only announces itself here, as a load error.
            // Recording it stops every other row by this author refetching it.
            onError={() => markAvatarMissing(email)}
          />
        </g>
      ) : (
        <>
          <circle cx={cx} cy={cy} r={radius} fill={`hsl(${hue} 45% 42%)`} />
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={size * 0.42}
            fontWeight={600}
            fill="hsl(0 0% 100%)"
            // The row's text already names the author to assistive tech via the
            // tooltip; initials read aloud as letters would be noise.
            aria-hidden
          >
            {initialsFor(name, email)}
          </text>
        </>
      )}

      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={ring}
        strokeWidth={ringWidth}
      />
    </g>
  );
}

/**
 * The one clip path every avatar in a style shares.
 *
 * Rendered once by the list, not per row: every avatar in a given style is the
 * same size, so a per-row id would mean 50 000 identical defs. Its circle sits
 * at the origin, and each avatar translates itself into that space rather than
 * the clip chasing the node.
 */
export function AvatarClipPath({ id, size }: { id: string; size: number }) {
  const r = size / 2;
  return (
    <clipPath id={id}>
      <circle cx={r} cy={r} r={r} />
    </clipPath>
  );
}
