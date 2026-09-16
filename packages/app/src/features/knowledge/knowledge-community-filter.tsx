import { useMemo, useRef, useState } from 'react';

import { useVirtualizer } from '@tanstack/react-virtual';
import {
  LuChevronDown,
  LuChevronRight,
  LuList,
  LuListTree,
  LuMaximize2,
  LuMinimize2,
} from 'react-icons/lu';

import type { KnowledgeGraphNode } from '@midnite/studio-shared';

import { IconButton } from '../../components/icon-button';
import { flattenCommunityTree, type CommunityTreeRow } from './knowledge-community-tree';
import type { CommunityListMode } from './knowledge-filters-store';

/**
 * Theme E's "community colour and filter — the 600 communities need their
 * own searchable list, not 600 checkboxes." Virtualized (`@tanstack/react-
 * virtual`, the same library the command palette uses to scroll/search a
 * long list) rather than rendering all 600 rows, searched client-side over
 * the already-known community name list.
 *
 * A block-list model: every community starts shown, `hidden` names the ones
 * toggled off — friendlier at 600 entries than an allow-list starting empty.
 *
 * Two modes, one toggle: **list** is the flat checkbox list above; **tree**
 * expands each community into its member nodes (`knowledge-community-
 * tree.ts` flattens it for the same virtualizer), where clicking a member
 * selects it and flies the camera there. Both modes carry the per-community
 * collapse toggle — the same fold `use-sigma-graph.ts` draws as a meta-node.
 */
export function KnowledgeCommunityFilter({
  communityNames,
  nodesByCommunity,
  hidden,
  collapsed,
  mode,
  onModeChange,
  onToggle,
  onShowAll,
  onHideAll,
  onToggleCollapsed,
  onCollapseAll,
  onExpandAll,
  onSelectNode,
}: {
  communityNames: readonly string[];
  nodesByCommunity: ReadonlyMap<string, readonly Pick<KnowledgeGraphNode, 'id' | 'label'>[]>;
  hidden: ReadonlySet<string>;
  collapsed: ReadonlySet<string>;
  mode: CommunityListMode;
  onModeChange: (mode: CommunityListMode) => void;
  onToggle: (name: string) => void;
  onShowAll: () => void;
  onHideAll: (names: readonly string[]) => void;
  onToggleCollapsed: (name: string) => void;
  onCollapseAll: (names: readonly string[]) => void;
  onExpandAll: () => void;
  onSelectNode: (nodeId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = useMemo<CommunityTreeRow[]>(() => {
    if (mode === 'tree') {
      return flattenCommunityTree({ communityNames, nodesByCommunity, expanded, query });
    }
    const needle = query.trim().toLowerCase();
    const names = needle
      ? communityNames.filter((name) => name.toLowerCase().includes(needle))
      : communityNames;
    return names.map((name) => ({
      kind: 'community' as const,
      name,
      memberCount: nodesByCommunity.get(name)?.length ?? 0,
      expanded: false,
    }));
  }, [mode, communityNames, nodesByCommunity, expanded, query]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 26,
    overscan: 12,
  });

  const toggleExpanded = (name: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const allCollapsed = communityNames.length > 0 && collapsed.size >= communityNames.length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-1 px-1">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            mode === 'tree'
              ? `Search ${communityNames.length} communities and their nodes…`
              : `Search ${communityNames.length} communities…`
          }
          className="h-7 min-w-0 flex-1 rounded border border-border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground"
          aria-label="Search communities"
        />
        <div
          role="group"
          aria-label="Community list mode"
          className="flex shrink-0 items-center rounded border border-border"
        >
          <IconButton
            icon={LuList}
            label="List"
            size="sm"
            aria-pressed={mode === 'list'}
            tone={mode === 'list' ? 'brand' : 'ghost'}
            className={mode === 'list' ? 'bg-primary/20 text-primary' : ''}
            onClick={() => onModeChange('list')}
          />
          <IconButton
            icon={LuListTree}
            label="Tree"
            size="sm"
            aria-pressed={mode === 'tree'}
            tone={mode === 'tree' ? 'brand' : 'ghost'}
            className={mode === 'tree' ? 'bg-primary/20 text-primary' : ''}
            onClick={() => onModeChange('tree')}
          />
        </div>
      </div>
      <div className="flex items-center gap-3 px-1 text-[11px] text-muted-foreground">
        <button type="button" className="hover:text-foreground" onClick={onShowAll}>
          Show all
        </button>
        <button
          type="button"
          className="hover:text-foreground"
          onClick={() => onHideAll(communityNames)}
        >
          Hide all
        </button>
        <span aria-hidden className="h-3 w-px bg-border" />
        <button
          type="button"
          className="hover:text-foreground disabled:opacity-50"
          disabled={allCollapsed}
          onClick={() => onCollapseAll(communityNames)}
        >
          Collapse all
        </button>
        <button
          type="button"
          className="hover:text-foreground disabled:opacity-50"
          disabled={collapsed.size === 0}
          onClick={onExpandAll}
        >
          Expand all
        </button>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto" data-testid="knowledge-community-rows">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((row) => {
            const item = rows[row.index];
            if (item === undefined) return null;
            const style = {
              position: 'absolute' as const,
              top: 0,
              left: 0,
              width: '100%',
              height: row.size,
              transform: `translateY(${row.start}px)`,
            };
            if (item.kind === 'node') {
              return (
                <button
                  key={`node:${item.id}`}
                  type="button"
                  style={style}
                  onClick={() => onSelectNode(item.id)}
                  className="flex items-center gap-2 pl-9 pr-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  title={item.label}
                >
                  <span className="truncate">{item.label}</span>
                </button>
              );
            }
            const isShown = !hidden.has(item.name);
            const isCollapsed = collapsed.has(item.name);
            return (
              <div
                key={item.name}
                style={style}
                className="group flex items-center gap-1 pr-1 text-xs hover:bg-accent/60"
                data-testid="knowledge-community-row"
              >
                {mode === 'tree' ? (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(item.name)}
                    aria-label={item.expanded ? `Collapse ${item.name}` : `Expand ${item.name}`}
                    aria-expanded={item.expanded}
                    className="flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    {item.expanded ? (
                      <LuChevronDown aria-hidden className="h-3.5 w-3.5" />
                    ) : (
                      <LuChevronRight aria-hidden className="h-3.5 w-3.5" />
                    )}
                  </button>
                ) : (
                  <span aria-hidden className="w-2 shrink-0" />
                )}
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={isShown} onChange={() => onToggle(item.name)} />
                  <span className={`truncate ${isCollapsed ? 'italic text-muted-foreground' : ''}`}>
                    {item.name}
                  </span>
                  <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground">
                    {item.memberCount}
                  </span>
                </label>
                <IconButton
                  icon={isCollapsed ? LuMaximize2 : LuMinimize2}
                  label={isCollapsed ? `Expand ${item.name} on the canvas` : `Collapse ${item.name} into one node`}
                  size="sm"
                  aria-pressed={isCollapsed}
                  className={isCollapsed ? 'text-primary' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}
                  onClick={() => onToggleCollapsed(item.name)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
