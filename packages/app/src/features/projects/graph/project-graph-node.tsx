import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';

import { CardAssignees, CardFieldChips, CardNumberRow, CardTitleRow, CONTENT_ICON } from '../board/card-chrome';
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
  onSelect: () => void;
}) {
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

  return (
    <div
      data-graph-node
      data-node-key={node.key}
      data-blocked={node.blocked ? '' : undefined}
      data-ready={node.ready ? '' : undefined}
      data-foreign={node.foreign ? '' : undefined}
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
        'project-graph-node flex cursor-pointer flex-col gap-1.5 overflow-hidden rounded border bg-background px-2 py-1.5 text-left text-xs',
        selected ? 'border-primary' : node.foreign ? 'border-dashed border-muted-foreground/50' : 'border-border',
        glow === 'idle' ? '' : `agent-run-glow is-${glow}`,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-start gap-1.5">
        <CardTitleRow icon={Icon} title={title} />
      </div>

      {detailed ? (
        <>
          {number !== null || assignees.length > 0 ? (
            <div className="flex items-center justify-between gap-2">
              <CardNumberRow number={number} href={href} />
              <CardAssignees assignees={assignees} />
            </div>
          ) : null}
          {item ? <CardFieldChips item={item} fields={fields} /> : null}
        </>
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
