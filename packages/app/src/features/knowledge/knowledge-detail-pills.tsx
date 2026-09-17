import { LuGlobe, LuLayers, LuTarget } from 'react-icons/lu';

import type { IconComponent } from '../../components/icon-button';
import {
  formatNodeCount,
  mountedNodeCount,
  offeredDetailLevels,
  type KnowledgeDetailId,
} from './knowledge-detail';

/**
 * The detail pill row — how much of the graph the canvas mounts
 * (`knowledge-detail.ts`). Same shape and chrome as
 * `knowledge-layout-pills.tsx`'s row, and `knowledge-view.tsx` puts the two
 * side by side in the one strip under the variant bar. Each label carries
 * the node count that level actually mounts for THIS graph ("Core · 1.5k",
 * "Everything · 15.3k"), so the choice reads as a cost, not a mood.
 *
 * Renders nothing for a graph that fits the smallest budget — one level is
 * no choice, and a permanently visible row explaining that would cost every
 * small repo a strip of height for nothing (the same "let the bar shrink"
 * rule Decision 9 applied to the layout row).
 */
const ICONS: Record<string, IconComponent> = {
  core: LuTarget,
  extended: LuLayers,
  all: LuGlobe,
};

export function KnowledgeDetailPills({
  nodeCount,
  activeId,
  onSelect,
}: {
  /** The whole graph's node count — what the budgets are measured against. */
  nodeCount: number;
  activeId: KnowledgeDetailId;
  onSelect: (id: KnowledgeDetailId) => void;
}) {
  const levels = offeredDetailLevels(nodeCount);
  if (levels.length < 2) return null;
  return (
    <div className="flex min-w-0 items-center gap-1.5" role="group" aria-label="Knowledge canvas detail">
      {levels.map((level) => {
        const Icon = ICONS[level.id] ?? LuLayers;
        const selected = level.id === activeId;
        return (
          <button
            key={level.id}
            type="button"
            aria-pressed={selected}
            title={`Mount ${mountedNodeCount(nodeCount, level).toLocaleString()} of ${nodeCount.toLocaleString()} nodes`}
            onClick={() => onSelect(level.id)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
              selected
                ? 'border-primary/60 bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
          >
            <Icon aria-hidden className="h-3 w-3 shrink-0" />
            {level.label}{' '}
            <span className="text-muted-foreground">· {formatNodeCount(mountedNodeCount(nodeCount, level))}</span>
          </button>
        );
      })}
    </div>
  );
}
