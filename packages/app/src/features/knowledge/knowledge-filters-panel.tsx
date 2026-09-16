import { useState } from 'react';

import { LuSearch, LuUsers } from 'react-icons/lu';

import type { KnowledgeGraphNode } from '@midnite/studio-shared';

import { KnowledgeCommunityFilter } from './knowledge-community-filter';
import type { KnowledgeFilterState } from './knowledge-filters';
import type { CommunityListMode } from './knowledge-filters-store';

/**
 * Theme E's filter chrome: search, the relation checkbox list, weight/
 * confidence sliders, and the community filter behind one toggle button
 * (`KnowledgeCommunityFilter`, its own file — 600 rows deserve their own
 * scroll region, not a corner of this one). "Show the count that is
 * hidden" (Decision 8) is `visibleLinkCount`/`totalLinkCount`, computed by
 * the caller (`knowledge-view.tsx`) since it needs the live graph, not just
 * filter state.
 */
export function KnowledgeFiltersPanel({
  filters,
  relations,
  communityNames,
  nodesByCommunity,
  collapsedCommunities,
  communityListMode,
  visibleLinkCount,
  totalLinkCount,
  onQueryChange,
  onToggleRelation,
  onMinWeightChange,
  onMinConfidenceChange,
  onToggleCommunity,
  onShowAllCommunities,
  onHideAllCommunities,
  onCommunityListModeChange,
  onToggleCollapsedCommunity,
  onCollapseAllCommunities,
  onExpandAllCommunities,
  onSelectNode,
}: {
  filters: KnowledgeFilterState;
  relations: readonly string[];
  communityNames: readonly string[];
  nodesByCommunity: ReadonlyMap<string, readonly Pick<KnowledgeGraphNode, 'id' | 'label'>[]>;
  collapsedCommunities: ReadonlySet<string>;
  communityListMode: CommunityListMode;
  visibleLinkCount: number;
  totalLinkCount: number;
  onQueryChange: (query: string) => void;
  onToggleRelation: (relation: string) => void;
  onMinWeightChange: (value: number) => void;
  onMinConfidenceChange: (value: number) => void;
  onToggleCommunity: (name: string) => void;
  onShowAllCommunities: () => void;
  onHideAllCommunities: (names: readonly string[]) => void;
  onCommunityListModeChange: (mode: CommunityListMode) => void;
  onToggleCollapsedCommunity: (name: string) => void;
  onCollapseAllCommunities: (names: readonly string[]) => void;
  onExpandAllCommunities: () => void;
  /** A member picked from the tree — select it and fly the camera there. */
  onSelectNode: (nodeId: string) => void;
}) {
  const [communityPanelOpen, setCommunityPanelOpen] = useState(false);
  const hiddenCommunityCount = filters.hiddenCommunities.size;
  const collapsedCount = collapsedCommunities.size;
  const communitySummary =
    hiddenCommunityCount > 0 || collapsedCount > 0
      ? [
          hiddenCommunityCount > 0 ? `${hiddenCommunityCount} hidden` : null,
          collapsedCount > 0 ? `${collapsedCount} collapsed` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : `${communityNames.length} shown`;

  return (
    <div className="flex h-full min-h-0 w-72 shrink-0 flex-col gap-3 overflow-auto border-r border-border bg-background p-3 text-xs">
      <div className="flex items-center gap-2 rounded border border-border px-2 py-1.5">
        <LuSearch aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          value={filters.query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search nodes…"
          aria-label="Search knowledge graph nodes"
          className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="font-medium text-muted-foreground">Relations</span>
          <span className="text-muted-foreground">
            {visibleLinkCount.toLocaleString()} / {totalLinkCount.toLocaleString()} edges
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          {relations.map((relation) => (
            <label key={relation} className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={filters.relations.has(relation)}
                onChange={() => onToggleRelation(relation)}
              />
              <span className="truncate">{relation}</span>
            </label>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="flex items-center justify-between text-muted-foreground">
          <span>Min weight</span>
          <span>{filters.minWeight.toFixed(2)}</span>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={filters.minWeight}
          onChange={(event) => onMinWeightChange(Number(event.target.value))}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="flex items-center justify-between text-muted-foreground">
          <span>Min confidence</span>
          <span>{filters.minConfidence.toFixed(2)}</span>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={filters.minConfidence}
          onChange={(event) => onMinConfidenceChange(Number(event.target.value))}
        />
      </label>

      <div className="flex min-h-0 flex-1 flex-col gap-1">
        <button
          type="button"
          onClick={() => setCommunityPanelOpen((open) => !open)}
          className="flex items-center justify-between rounded border border-border px-2 py-1.5 text-left hover:bg-accent"
          aria-expanded={communityPanelOpen}
        >
          <span className="flex items-center gap-1.5">
            <LuUsers aria-hidden className="h-3.5 w-3.5" />
            Communities
          </span>
          <span className="text-muted-foreground">{communitySummary}</span>
        </button>
        {communityPanelOpen ? (
          <div className="min-h-0 flex-1">
            <KnowledgeCommunityFilter
              communityNames={communityNames}
              nodesByCommunity={nodesByCommunity}
              hidden={filters.hiddenCommunities}
              collapsed={collapsedCommunities}
              mode={communityListMode}
              onModeChange={onCommunityListModeChange}
              onToggle={onToggleCommunity}
              onShowAll={onShowAllCommunities}
              onHideAll={onHideAllCommunities}
              onToggleCollapsed={onToggleCollapsedCommunity}
              onCollapseAll={onCollapseAllCommunities}
              onExpandAll={onExpandAllCommunities}
              onSelectNode={onSelectNode}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
