import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import { useMemo } from 'react';
import { LuCircleCheck, LuCircleStop, LuPlay, LuSquareTerminal } from 'react-icons/lu';

import { useDialogs } from '../../../components/dialog-host';
import { useActiveWorktree } from '../../../services/use-status';
import { ActivityBadgeStack } from '../../activity/activity-badge';
import type { ActivityGlowBadge } from '../../activity/use-activity-glow';
import { closeSessionWithConfirm } from '../../terminal/close-session';
import { revealSession } from '../../terminal/reveal-session';
import { findCardSession, useTerminalStore } from '../../terminal/terminal-store';
import { CardAssignees, CardFieldChips, CardNumberRow, CardTitleRow, CONTENT_ICON } from '../board/card-chrome';
import type { CardGlowState } from '../board/glow-state';
import { useCardPlay } from '../board/use-card-play';
import { FORGE_GRAPH_GEOMETRY, type PositionedNode } from './graph-layout';

/**
 * One node of the dependency graph (Phase 75 Theme D) — an absolutely
 * positioned HTML element, not an SVG `<rect>`, for the reason the phase
 * doc's own grounding audit gives: `.agent-run-glow` is a `background-clip`
 * border trick no SVG element can wear, and SVG has no conic gradient at
 * all. `ProjectGraphView` places this inside the transformed container that
 * carries pan/zoom, so `node.x`/`node.y` are graph-space coordinates —
 * exactly what `graph-layout.ts` produced — and this component reads none of
 * the current viewport itself.
 *
 * A pure, memoizable component: `glow` arrives as a plain prop from
 * `useGraphAgentStates` (one subscription for the whole canvas, Theme F),
 * never a per-node store read.
 */
const EMPTY_BADGES: readonly ActivityGlowBadge[] = [];

export function ProjectGraphNode({
  node,
  item,
  fields,
  glow,
  badges = EMPTY_BADGES,
  selected,
  tabIndex = -1,
  detailed = true,
  projectId,
  onSelect,
}: {
  node: PositionedNode;
  /** `undefined` for a foreign node — one referenced by a board item's
   *  dependencies but never itself added to the board. */
  item: ForgeProjectItem | undefined;
  fields: readonly ForgeProjectField[];
  glow: CardGlowState;
  /** The node's live-session identity badge(s) (Phase 95 Theme C) — `useGraphAgentStates`'s own entry, defaulted so every existing caller (every test in this suite included) keeps compiling unchanged. */
  badges?: readonly ActivityGlowBadge[];
  /** Whether this node's detail pane is the one currently open — a visual
   *  ring, distinct from keyboard focus (`tabIndex` below). Mirrors
   *  `TaskCard`'s own `isOpen`/roving-`tabIndex` split. */
  selected: boolean;
  /** Roving tabindex (mirrors `board-view.tsx`'s pattern): exactly one node
   *  on the canvas is `0` at a time, reachable by `Tab`; every other is `-1`,
   *  reachable only via the graph's own arrow-key navigation. */
  tabIndex?: number;
  /** Level of detail (Theme D's own rule): below `scale: 0.5` a node shows
   *  its title only — chips and avatars are illegible at that size and cost
   *  a DOM subtree per node nobody can read. */
  detailed?: boolean;
  projectId?: string | null;
  onSelect: () => void;
}) {
  const { repoId, worktreePath } = useActiveWorktree();
  const sessions = useTerminalStore((s) => s.sessions);
  const states = useTerminalStore((s) => s.states);
  const taskRef = useMemo(() => ({ projectId: projectId ?? '', itemId: item?.id ?? '' }), [projectId, item?.id]);
  const liveSession = item ? findCardSession(sessions, states, taskRef) : undefined;
  const { onPlay } = useCardPlay({ item, repoId, worktreePath, taskRef, sessionId: liveSession?.id });
  const dialogs = useDialogs();

  const Icon = CONTENT_ICON[node.kind];
  // A foreign node with no title of its own (the field/body layers never
  // fetch one — see the phase doc's own note) falls back to its number as
  // the title. Showing the number a second time in the row below would just
  // repeat it, so that row is skipped for exactly this case.
  const titleIsNumberFallback = !item && !node.title && node.number !== null;
  const title = item ? item.content.title : node.title || (node.number !== null ? `#${node.number}` : 'Unknown issue');
  const assignees = item?.content.assignees ?? [];
  const href = resolveHref(node, item);
  const number = titleIsNumberFallback ? null : node.number;

  const isClosed = node.state === 'closed';
  const borderClass = isClosed
    ? selected
      ? 'border-[2.5px] border-primary is-closed'
      : 'border-[2.5px] border-[hsl(var(--dep-done))] is-closed'
    : selected
      ? 'border border-primary'
      : node.foreign
        ? 'border border-dashed border-muted-foreground/50'
        : 'border border-border';

  return (
    <div
      data-graph-node
      data-node-key={node.key}
      data-blocked={node.blocked ? '' : undefined}
      data-ready={node.ready ? '' : undefined}
      data-foreign={node.foreign ? '' : undefined}
      data-closed={isClosed ? '' : undefined}
      role="button"
      aria-pressed={selected}
      tabIndex={tabIndex}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      style={{
        position: 'absolute',
        left: node.x,
        top: node.y,
        width: FORGE_GRAPH_GEOMETRY.width,
        height: FORGE_GRAPH_GEOMETRY.height,
      }}
      className={[
        // No `overflow-hidden`: the graph-only bloom (`styles.css`'s
        // `.project-graph-node.agent-run-glow::after`) bleeds 10px past this
        // box on purpose, and clipping it here would hide it entirely.
        // Title truncation is `CardTitleRow`'s own inner `truncate` span —
        // it never depended on this element's overflow. `relative` anchors
        // the ready badge below.
        'project-graph-node relative flex cursor-pointer flex-col rounded bg-background px-2 py-1.5 text-left text-xs',
        borderClass,
        glow === 'idle' ? '' : `agent-run-glow is-${glow}`,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {badges.length > 0 ? (
        <ActivityBadgeStack badges={badges} className="absolute -left-1.5 -top-1.5 z-10" />
      ) : null}
      {/*
        Theme E's dimming lives on this inner wrapper, never the outer
        element above — the outer one is what carries `agent-run-glow`, and
        a blocked node whose agent is somehow still running must read as
        running (Theme F's ring wins over Theme E's dimming; stated here as
        the explicit precedence the phase doc calls for, not left to
        cascade order). Tailwind's arbitrary `saturate-*`/`opacity-*` need
        the bare `filter` utility alongside them to actually apply — Tailwind
        only composites the filter chain through that class.
      */}
      <div className={['flex flex-col gap-1.5', node.blocked ? 'opacity-[0.55] saturate-[.4] filter' : ''].filter(Boolean).join(' ')}>
        <div className="flex items-start justify-between gap-1.5">
          <div className="flex min-w-0 flex-1 items-start gap-1.5">
            <CardTitleRow icon={Icon} title={title} />
          </div>
          {detailed && assignees.length > 0 ? (
            <div className="-mt-0.5 shrink-0">
              <CardAssignees assignees={assignees} />
            </div>
          ) : null}
        </div>

        {detailed ? (
          <>
            {number !== null ? (
              <div className="flex items-center justify-between gap-2 pr-6">
                <CardNumberRow number={number} href={href} />
              </div>
            ) : null}
            {item ? (
              <div className="pr-6">
                <CardFieldChips item={item} fields={fields} />
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {/*
        Bottom-right Start / Stop / `>_` (Phase 95 Theme G) — the identical
        fork `TaskCard`'s own copy makes, minus a `>_` toggle over an
        embedded terminal: a graph node never mounts one (Theme C's own
        note — the canvas is still hand-rolled SVG with no node view to
        attach a `CardTerminal` to), so `>_` here is exactly what
        `revealSession` already did for the old single Play/reveal button —
        open the main dock panel on this session.
      */}
      {detailed && item ? (
        <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5">
          {liveSession ? (
            <>
              <button
                type="button"
                data-testid="graph-node-terminal-toggle"
                aria-label="Open in terminal"
                title="Open in terminal"
                onClick={(event) => {
                  event.stopPropagation();
                  revealSession(liveSession.id);
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <LuSquareTerminal aria-hidden className="h-3 w-3" />
              </button>
              <button
                type="button"
                data-testid="graph-node-stop-agent"
                aria-label="Stop agent"
                title="Stop agent"
                onClick={(event) => {
                  event.stopPropagation();
                  // `findCardSession` narrows its return to a `Pick` of the
                  // fields the glow/status callers need; `closeSessionWithConfirm`
                  // wants the full `TerminalSession`, so this re-finds it by id
                  // off the same `sessions` list rather than widening the
                  // shared lookup's own return type for one caller.
                  const full = sessions.find((s) => s.id === liveSession.id);
                  if (full) closeSessionWithConfirm(dialogs, full);
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <LuCircleStop aria-hidden className="h-3 w-3" />
              </button>
            </>
          ) : (
            <button
              type="button"
              data-testid="graph-node-play-agent"
              aria-label="Start agent"
              title="Start agent"
              onClick={onPlay}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LuPlay aria-hidden className="h-3 w-3 fill-current" />
            </button>
          )}
        </div>
      ) : null}

      {/*
        An affirmative badge, not merely the absence of dimming — the
        graph's whole argument is "here is what you can start now", and that
        reads only if `ready` has its own positive mark rather than just
        looking like every other un-blocked, un-touched node. Outside the
        dimmed wrapper above (a `ready` node is, by construction, never also
        `blocked` — `forge-graph.ts`'s own readiness rule), and outside the
        glow ring's own precedence fight entirely.
      */}
      {node.ready ? (
        <LuCircleCheck
          role="img"
          aria-label="Ready to start"
          className="absolute -right-1.5 -top-1.5 h-3.5 w-3.5 rounded-full bg-background text-[hsl(var(--dep-done))]"
        />
      ) : null}
    </div>
  );
}

/** A local item already has a real URL. A foreign node only ever carries a
 *  number and a repo — `''` means "same repo as the board", which this
 *  component has no way to resolve into a real link (see the phase's own
 *  `boardRepo: ''` note), so it renders as plain text rather than a guess. */
function resolveHref(node: PositionedNode, item: ForgeProjectItem | undefined): string | null {
  if (item) return item.content.type === 'draft' ? null : item.content.url;
  if (node.foreign && node.repo && node.number !== null) {
    return `https://github.com/${node.repo}/issues/${node.number}`;
  }
  return null;
}
