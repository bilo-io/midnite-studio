import { LuBoxes, LuTrash2 } from 'react-icons/lu';
import type { GamePrefabListEntry } from '@midnite/studio-shared';

import { EmptyState, Skeleton } from '@midnite/studio-frame';

import { arm, endAssetDrag, startAssetDrag, useArmedAsset } from './asset-drag';

/**
 * The Prefabs tab of the asset browser (Phase 139 Theme G): one tile per `levels/prefabs/*.prefab.json`. A tile drags
 * onto the canvas (kind `prefab`) or arms for click-to-place; the trash button asks the editor to delete it (the
 * editor owns the confirm, because the blast radius is this level's instance count).
 */
export function PrefabList({
  prefabs,
  loading,
  is3d,
  onDelete,
}: {
  prefabs: readonly GamePrefabListEntry[] | undefined;
  loading?: boolean;
  is3d: boolean;
  onDelete: (name: string) => void;
}) {
  const armed = useArmedAsset();
  if (loading || prefabs === undefined) {
    return (
      <div className="flex flex-wrap gap-1.5 p-2" aria-busy data-testid="level-prefabs-loading">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-24" />
        ))}
      </div>
    );
  }
  if (prefabs.length === 0) {
    return <EmptyState icon={LuBoxes} title="No prefabs yet" body="Select objects, right-click and choose Save as prefab… to reuse them." />;
  }
  return (
    <ul aria-label="Prefabs" className="flex min-h-0 flex-1 flex-wrap content-start gap-1.5 overflow-y-auto p-2" data-testid="level-prefabs-grid">
      {prefabs.map((p) => {
        const wrongDimension = p.dimension !== null && (p.dimension === '3d') !== is3d;
        const isArmed = armed?.kind === 'prefab' && armed.name === p.name;
        const unusable = p.issue !== undefined || wrongDimension;
        const toggleArm = () => !unusable && arm(isArmed ? null : { kind: 'prefab', name: p.name });
        return (
          <li key={p.name} className="relative">
            <button
              type="button"
              draggable={!unusable}
              data-testid="level-prefab-tile"
              aria-label={`${p.name} (prefab, ${p.objects} objects)`}
              aria-pressed={isArmed}
              disabled={unusable}
              title={p.issue ?? (wrongDimension ? `This prefab is for ${p.dimension === '3d' ? '3D' : '2D'} levels.` : `${p.name}\n${p.objects} objects${p.description ? `\n${p.description}` : ''}`)}
              onDragStart={(e) => startAssetDrag(e.dataTransfer, { kind: 'prefab', name: p.name })}
              onDragEnd={endAssetDrag}
              onClick={toggleArm}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  toggleArm();
                }
              }}
              className={`flex h-24 w-24 flex-col items-center justify-center gap-1 rounded border p-1 text-[11px] disabled:opacity-50 ${isArmed ? 'border-primary bg-accent' : 'border-border hover:bg-accent'}`}
            >
              <LuBoxes aria-hidden className="h-8 w-8 text-muted-foreground" />
              <span className="w-full truncate text-center">{p.name}</span>
              <span className="text-muted-foreground">{p.objects} {p.objects === 1 ? 'object' : 'objects'}{p.dimension ? ` · ${p.dimension}` : ''}</span>
            </button>
            <button
              type="button"
              aria-label={`Delete prefab ${p.name}`}
              title="Delete prefab"
              onClick={() => onDelete(p.name)}
              className="absolute right-0.5 top-0.5 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
            >
              <LuTrash2 aria-hidden className="h-3 w-3" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
