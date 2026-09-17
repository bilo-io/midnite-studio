import { LuCircleDot, LuExpand, LuListTree, LuMagnet } from 'react-icons/lu';

import type { IconComponent } from '../../components/icon-button';

/**
 * The layout pill row (Phase 89 Theme E) — one pressable pill per
 * worker-computed layout, in its own thin strip directly under
 * `KnowledgeVariantPills`'s own bar (`knowledge-view.tsx` wraps this
 * component's own row with the same `border-b`/padding chrome that bar
 * uses, so the two read as one toolbar area above the canvas, not two
 * unrelated things). Unlike the variant pills, this list is small and fixed
 * (four ids, `layout.ts`'s own `LAYOUT_IDS`), so it skips
 * `knowledge-variant-pills.tsx`'s overflow measurement machinery — that
 * exists because a variant registry keeps growing (Themes D, F–I); a fifth
 * worker layout is not this phase's concern.
 *
 * Offered only when the active variant's engine actually consumes worker
 * coordinates (Decision 9) — `knowledge-view.tsx` is what decides that and
 * simply does not render this row at all otherwise (the bar shrinks by one
 * row), rather than this component rendering itself disabled.
 */
export type KnowledgeLayoutPillId = string;

type LayoutPillDef = { id: KnowledgeLayoutPillId; label: string; icon: IconComponent };

/**
 * Labels/icons for `@midnite/studio-knowledge`'s `LAYOUT_IDS`
 * (`force-atlas2`, `circlepack`, `hierarchical`, `noverlap`) — this file
 * cannot import that package (`app` may not import `knowledge`, the boundary
 * `CLAUDE.md` enforces), so the ids are this file's own literal copy, same
 * as `knowledge.test.ts`'s `KNOWLEDGE_LAYOUT_IDS` on the shared/wire side.
 * `knowledge-layout-pills.test.tsx` is the tripwire that keeps this list and
 * `@midnite/studio-shared`'s `KNOWLEDGE_LAYOUT_IDS` in step.
 */
const LAYOUT_PILLS: readonly LayoutPillDef[] = [
  { id: 'force-atlas2', label: 'Atlas', icon: LuMagnet },
  { id: 'circlepack', label: 'Clusters', icon: LuCircleDot },
  { id: 'hierarchical', label: 'Hierarchy', icon: LuListTree },
  { id: 'noverlap', label: 'Spread', icon: LuExpand },
];

export function KnowledgeLayoutPills({
  activeId,
  onSelect,
}: {
  activeId: KnowledgeLayoutPillId;
  onSelect: (id: KnowledgeLayoutPillId) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5" role="group" aria-label="Knowledge canvas layout">

      {LAYOUT_PILLS.map((pill) => (
        <LayoutPill key={pill.id} pill={pill} selected={pill.id === activeId} onSelect={onSelect} />
      ))}
    </div>
  );
}

function LayoutPill({
  pill,
  selected,
  onSelect,
}: {
  pill: LayoutPillDef;
  selected: boolean;
  onSelect: (id: KnowledgeLayoutPillId) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(pill.id)}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
        selected
          ? 'border-primary/60 bg-primary/10 text-foreground'
          : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
      }`}
    >
      <pill.icon aria-hidden className="h-3 w-3 shrink-0" />
      {pill.label}
    </button>
  );
}
