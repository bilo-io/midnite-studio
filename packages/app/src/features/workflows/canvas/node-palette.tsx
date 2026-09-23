import type { WorkflowNodeKind } from '@midnite/studio-shared';
import { WORKFLOW_NODE_KINDS } from '@midnite/studio-shared';
import { useMemo, useState } from 'react';
import { LuPanelLeftClose, LuPanelLeftOpen } from 'react-icons/lu';

import { FilterInput } from '../../../components/filter-input';
import { IconButton } from '../../../components/icon-button';
import { NODE_KIND_META } from './node-kind-meta';

/** The `dataTransfer` MIME the palette's drag source and the canvas's drop target agree on — this feature's own type, not a general-purpose one. */
export const WORKFLOW_NODE_DND_MIME = 'application/x-midnite-workflow-node-kind';

/**
 * The workflow canvas's node palette (Phase 95 Theme I, ported from
 * midnite's `node-palette.tsx`) — collapsible, searchable, and the drag
 * source `workflow-canvas.tsx`'s `onDrop` reads. A click also adds the node
 * (centred on the canvas, via `onAddNode`), so the palette stays usable with
 * a keyboard or a pointer that can't drag.
 *
 * One category ("Nodes") today: none of this MVP's five kinds is a
 * `trigger`, so a grouped-by-category header would show four groups of one
 * or two rows — worse than a flat, alphabetised-by-kind list at this size.
 * `node-kind-meta.ts`'s `category` is still read (for each row's tint chip)
 * and grouping is exactly where Theme J's `agent`/`script` kinds make this
 * genuinely multi-group.
 */
export function NodePalette({
  collapsed,
  onToggleCollapsed,
  onAddNode,
  disabled,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onAddNode: (kind: WorkflowNodeKind) => void;
  /** Read-only run view (Theme G) — the palette still shows, but nothing in it is actionable. */
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();

  const rows = useMemo(
    () =>
      WORKFLOW_NODE_KINDS.filter((kind) => {
        if (needle === '') return true;
        const meta = NODE_KIND_META[kind];
        return meta.label.toLowerCase().includes(needle) || meta.description.toLowerCase().includes(needle);
      }),
    [needle],
  );

  if (collapsed) {
    return (
      <div className="flex h-full shrink-0 flex-col items-center border-r border-border py-1.5">
        <IconButton icon={LuPanelLeftOpen} label="Show node palette" size="sm" onClick={onToggleCollapsed} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nodes</h2>
        <IconButton icon={LuPanelLeftClose} label="Hide node palette" size="sm" className="ml-auto" onClick={onToggleCollapsed} />
      </div>
      <div className="shrink-0 border-b border-border px-2 py-1.5">
        <FilterInput value={query} onChange={setQuery} placeholder="Filter nodes…" />
      </div>
      <div role="list" aria-label="Node types" className="hide-scrollbar min-h-0 flex-1 overflow-auto p-1.5">
        {rows.length === 0 ? (
          <p className="px-1.5 py-2 text-[11px] text-muted-foreground">No node matches this filter.</p>
        ) : (
          rows.map((kind) => {
            const meta = NODE_KIND_META[kind];
            const Icon = meta.icon;
            return (
              <button
                key={kind}
                type="button"
                role="listitem"
                draggable={!disabled}
                disabled={disabled}
                aria-label={`Add ${meta.label} node`}
                title={meta.description}
                onDragStart={(event) => {
                  event.dataTransfer.setData(WORKFLOW_NODE_DND_MIME, kind);
                  event.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => onAddNode(kind)}
                className="mb-1 flex w-full cursor-grab items-start gap-2 rounded-md border border-transparent px-1.5 py-1.5 text-left transition-colors last:mb-0 hover:border-border hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span
                  aria-hidden
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded"
                  style={{ background: `color-mix(in srgb, var(--node-${meta.category}) 24%, transparent)` }}
                >
                  <Icon aria-hidden className="h-3 w-3" style={{ color: `var(--node-${meta.category})` }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-foreground">{meta.label}</span>
                  <span className="block truncate text-[10.5px] text-muted-foreground">{meta.description}</span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
