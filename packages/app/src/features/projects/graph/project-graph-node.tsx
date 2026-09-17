import { BUILTIN_AGENTS, type ForgeProjectField, type ForgeProjectItem } from '@midnite/studio-shared';
import { useMemo } from 'react';
import { LuCircleCheck, LuPlay } from 'react-icons/lu';

import { useActiveWorktree } from '../../../services/use-status';
import { revealSession } from '../../terminal/reveal-session';
import { startAgent } from '../../terminal/start-agent';
import { findCardSession, useTerminalStore } from '../../terminal/terminal-store';
import { CardAssignees, CardFieldChips, CardNumberRow, CardTitleRow, CONTENT_ICON } from '../board/card-chrome';
import { composeCardPrompt } from '../board/board-derive';
import type { CardGlowState } from '../board/glow-state';
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
export function ProjectGraphNode({
  node,
  item,
  fields,
  glow,
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
        Bottom-right Play button: triggers an agent session or reveals terminal if active.
      */}
      {detailed && item ? (
        <button
          type="button"
          data-testid="graph-node-play-agent"
          aria-label={liveSession ? 'Open in terminal' : 'Start agent'}
          title={liveSession ? 'Open in terminal' : 'Start agent'}
          onClick={(event) => {
            event.stopPropagation();
            if (liveSession) {
              revealSession(liveSession.id);
              return;
            }
            const targetCwd = worktreePath ?? '';
            const prompt = composeCardPrompt(item, targetCwd);
            const mostRecent = sessions
              .filter((s) => s.repoId === repoId && s.kind === 'agent' && s.agentId !== undefined)
              .sort((a, b) => b.createdAt - a.createdAt)[0];
            const agentId = mostRecent?.agentId ?? BUILTIN_AGENTS[0]?.id ?? 'claude';
            const agent = BUILTIN_AGENTS.find((a) => a.id === agentId) ?? BUILTIN_AGENTS[0]!;

            const session = startAgent({
              repoId: repoId ?? '',
              cwd: targetCwd,
              title: item.content.title,
              prompt,
              agentId: agent.id,
              command: agent.command,
              surface: 'kanban',
              taskRef,
              autoSend: true,
            });
            revealSession(session.id);
          }}
          className="absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <LuPlay aria-hidden className="h-3 w-3 fill-current" />
        </button>
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
