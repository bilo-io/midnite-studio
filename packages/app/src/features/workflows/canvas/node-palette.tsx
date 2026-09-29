import type { WorkflowNodeKind } from '@midnite/studio-shared';
import { WORKFLOW_NODE_KINDS } from '@midnite/studio-shared';
import { useMemo, useState } from 'react';

import { FilterInput } from '../../../components/filter-input';
import { TreeSection } from '../../../components/tree-section';
import { NODE_GROUPS, NODE_KIND_META, type NodeGroup } from './node-kind-meta';

/** The `dataTransfer` MIME the palette's drag source and the canvas's drop target agree on — this feature's own type, not a general-purpose one. */
export const WORKFLOW_NODE_DND_MIME = 'application/x-midnite-workflow-node-kind';

/** Whether a kind matches the palette's filter — label or description, case-insensitive. */
export function paletteKindMatches(kind: WorkflowNodeKind, needle: string): boolean {
  if (needle === '') return true;
  const meta = NODE_KIND_META[kind];
  return meta.label.toLowerCase().includes(needle) || meta.description.toLowerCase().includes(needle);
}

/**
 * Every {@link NODE_GROUPS} entry with the kinds that match `needle`, in the
 * group's display order and, within a group, `WORKFLOW_NODE_KINDS` order.
 * Groups left empty by the filter are dropped, so a search reads as one
 * result list split under headings rather than a column of empty sections.
 */
export function paletteGroups(needle: string): { id: NodeGroup; label: string; kinds: WorkflowNodeKind[] }[] {
  return NODE_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    kinds: WORKFLOW_NODE_KINDS.filter((kind) => NODE_KIND_META[kind].group === group.id && paletteKindMatches(kind, needle)),
  })).filter((group) => group.kinds.length > 0);
}

/**
 * The workflow canvas's node palette (Phase 95 Theme I, ported from
 * midnite's `node-palette.tsx`) — searchable, and the drag
 * source `workflow-canvas.tsx`'s `onDrop` reads. A click also adds the node
 * (centred on the canvas, via `onAddNode`), so the palette stays usable with
 * a keyboard or a pointer that can't drag.
 *
 * Rows sit under labelled, individually collapsible sections, one per
 * `node-kind-meta.ts` {@link NODE_GROUPS} entry (`TreeSection`, the sidebar's
 * own grouping grammar). The filter searches across every group at once:
 * while a query is typed, each group with a match is shown open regardless of
 * its collapsed state — a hit hidden inside a folded section would read as
 * "no match" — and clearing the query restores whatever the user had folded.
 *
 * Showing and hiding the whole palette is not this component's job: the
 * editor (`workflows-view.tsx`) collapses its column to zero width, and the
 * toggle for it sits at the left end of the canvas toolbar.
 */
export function NodePalette({
  onAddNode,
  disabled,
}: {
  onAddNode: (kind: WorkflowNodeKind) => void;
  /** Read-only run view (Theme G) — the palette still shows, but nothing in it is actionable. */
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [foldedGroups, setFoldedGroups] = useState<ReadonlySet<NodeGroup>>(() => new Set());
  const needle = query.trim().toLowerCase();
  const searching = needle !== '';

  const groups = useMemo(() => paletteGroups(needle), [needle]);

  const toggleGroup = (id: NodeGroup) =>
    setFoldedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nodes</h2>
      </div>
      <div className="shrink-0 border-b border-border px-2 py-1.5">
        <FilterInput value={query} onChange={setQuery} placeholder="Filter nodes…" />
      </div>
      <div
        role="region"
        aria-label="Node types"
        className="hide-scrollbar min-h-0 flex-1 overflow-auto px-1.5 pb-1.5"
      >
        {groups.length === 0 ? (
          <p className="px-1.5 py-2 text-[11px] text-muted-foreground">No node matches this filter.</p>
        ) : (
          groups.map((group) => (
            <TreeSection
              key={group.id}
              title={group.label}
              count={group.kinds.length}
              collapsible
              open={searching || !foldedGroups.has(group.id)}
              onToggle={() => toggleGroup(group.id)}
            >
              <div role="list" aria-label={group.label}>
                {group.kinds.map((kind) => (
                  <PaletteRow key={kind} kind={kind} disabled={disabled} onAddNode={onAddNode} />
                ))}
              </div>
            </TreeSection>
          ))
        )}
      </div>
    </div>
  );
}

function PaletteRow({
  kind,
  disabled,
  onAddNode,
}: {
  kind: WorkflowNodeKind;
  disabled: boolean | undefined;
  onAddNode: (kind: WorkflowNodeKind) => void;
}) {
  const meta = NODE_KIND_META[kind];
  const Icon = meta.icon;
  return (
    <button
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
        style={{ background: `color-mix(in srgb, hsl(var(--node-${meta.category})) 24%, transparent)` }}
      >
        <Icon aria-hidden className="h-3 w-3" style={{ color: `hsl(var(--node-${meta.category}))` }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">{meta.label}</span>
        <span className="block truncate text-[10.5px] text-muted-foreground">{meta.description}</span>
      </span>
    </button>
  );
}
