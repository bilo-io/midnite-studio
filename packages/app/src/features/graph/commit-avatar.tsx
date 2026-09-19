import type { AgentDefinition, CommitProvenance } from '@midnite/studio-shared';
import { useSyncExternalStore } from 'react';

import { resolveAgentIcon } from '../../components/icons';
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

/**
 * Why the agent glyph below is wrapped in a `<foreignObject>` rather than
 * drawn as a plain nested `<svg>`, as every other piece of node geometry
 * here is.
 *
 * A `<svg>` (`resolveAgentIcon`'s result — `claude-icon.tsx` and its
 * siblings, or a `react-icons/si`/`react-icons/lu` glyph) nested inside
 * ANOTHER `<svg>` — this node sits inside the row's own gutter `<svg>`,
 * `graph-svg.tsx` — does not reliably honour `style.width`/`style.height`
 * in Chromium: with no `width`/`height` XML ATTRIBUTE of its own, its
 * painted size instead comes from the SVG "auto→100%" default, resolved
 * against whatever the ANCESTOR svg's own established viewport happens to
 * be — which varies with the gutter's width, i.e. with how many lanes the
 * graph has open. That silent, lane-count-dependent mismatch is what
 * shipped as Phase 78 Theme C's "orange asterisk" bug: an icon meant to
 * read as ~0.6× the avatar rendered several times larger, off-centre (the
 * translate math was sized for the small icon), floating off the row's own
 * baseline and spilling into the commit-message column.
 *
 * A `<foreignObject>` sidesteps the whole question: its content is laid out
 * under normal CSS box rules, exactly like the HTML-context usages of the
 * same icons (`graph-row.tsx`'s author-column badge, `provenance-mark.tsx`,
 * both outside any SVG and both unaffected by this), so `style.width`/
 * `style.height` apply the way they would to any other HTML/SVG element —
 * no assumption about the icon's own viewBox, no dependence on lane count.
 */

export function CommitAvatar({
  email,
  name,
  cx,
  cy,
  size,
  ring,
  ringWidth,
  clipId,
  provenance,
  agent,
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
  /** Commit provenance (Phase 78 Theme C). */
  provenance?: CommitProvenance;
  /** Resolved agent definition. */
  agent?: AgentDefinition | null;
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

  const isAgent = provenance?.kind === 'agent';
  const isMixed = provenance?.kind === 'mixed';
  const agentId = provenance && provenance.kind !== 'human' ? provenance.agentIds[0] : undefined;
  const AgentIcon =
    isAgent || isMixed ? resolveAgentIcon(agent ?? { id: agentId ?? 'claude' }) : null;

  return (
    <g>
      {isAgent ? (
        <g data-testid="svg-agent-avatar">
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill={agent?.accent ? `${agent.accent}25` : 'hsl(var(--muted))'}
          />
          {AgentIcon ? (
            <foreignObject
              x={cx - (size * 0.6) / 2}
              y={cy - (size * 0.6) / 2}
              width={size * 0.6}
              height={size * 0.6}
            >
              <AgentIcon
                style={{
                  width: size * 0.6,
                  height: size * 0.6,
                  color: agent?.accent ?? 'hsl(var(--foreground))',
                }}
              />
            </foreignObject>
          ) : null}
        </g>
      ) : (
        <>
          {/*
            Drawn under both states, not just the fallback: once `status` flips to
            'ready' the <image> still has to fetch its bytes over the network, and
            without this the node goes transparent for that gap instead of just
            swapping from initials to the loaded face.
          */}
          <circle cx={cx} cy={cy} r={radius} fill={`hsl(${hue} 45% 42%)`} />

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
          )}
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

      {isMixed && AgentIcon ? (
        <g data-testid="svg-mixed-badge">
          <circle
            cx={cx + radius * 0.5}
            cy={cy + radius * 0.5}
            r={radius * 0.45}
            fill="hsl(var(--background))"
            stroke={ring}
            strokeWidth={1}
          />
          <foreignObject
            x={cx + radius * 0.5 - radius * 0.28}
            y={cy + radius * 0.5 - radius * 0.28}
            width={radius * 0.56}
            height={radius * 0.56}
          >
            <AgentIcon
              style={{
                width: radius * 0.56,
                height: radius * 0.56,
                color: agent?.accent ?? 'hsl(var(--foreground))',
              }}
            />
          </foreignObject>
        </g>
      ) : null}
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
