import { TERRAIN_BUILD_STAGES, TERRAIN_INPUT_SLOTS, TERRAIN_RESOLUTIONS, type TerrainSpec } from '@midnite/studio-shared';
import { useState } from 'react';
import { LuGrid3X3, LuSquare } from 'react-icons/lu';

import { IconSelect } from '../../../components/icon-select';
import { Spinner } from '../../../components/skeleton';
import { NumberField } from '../model/fields';
import { TerrainInputSlot } from './terrain-input-slot';
import { useTerrainActions, useTerrainProgress, type BuildOutcome, type TerrainRef } from './use-terrain';

const RESOLUTION_OPTIONS = TERRAIN_RESOLUTIONS.map((n) => ({ value: String(n), label: `${n} × ${n}`, icon: LuGrid3X3 }));

const STAGE_LABEL: Record<(typeof TERRAIN_BUILD_STAGES)[number], string> = {
  decode: 'Reading images',
  heightfield: 'Shaping the ground',
  erosion: 'Eroding',
  drape: 'Draping the texture',
  landcover: 'Classifying land cover',
  splat: 'Blending materials',
  roads: 'Tracing roads',
  conform: 'Flattening under roads and buildings',
  foliage: 'Scattering foliage',
  buildings: 'Raising buildings',
  write: 'Writing the terrain',
};

/**
 * The right-hand panel of Media ▸ Terrain: three optional image slots, the grid and the extent, and
 * Generate (which becomes Cancel while a build runs). Whether there is anything to build from is
 * main's call: `terrain-build` answers `needs-height-source` and the panel just reports it.
 */
export function TerrainPanel({ repoId, terrainRef, spec }: { repoId: string; terrainRef: TerrainRef; spec: TerrainSpec }) {
  const actions = useTerrainActions(repoId, terrainRef);
  const progress = useTerrainProgress(actions.buildId);
  const [outcome, setOutcome] = useState<BuildOutcome | null>(null);
  const revision = spec.updatedAt ?? '';

  const generate = async () => {
    setOutcome(null);
    setOutcome(await actions.generate());
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3" data-testid="terrain-panel">
      <h2 className="truncate text-sm font-semibold">{spec.name}</h2>

      <div className="flex flex-col gap-3">
        {TERRAIN_INPUT_SLOTS.map((slot) => (
          <TerrainInputSlot
            key={slot}
            slot={slot}
            input={spec.inputs[slot]}
            repoId={repoId}
            project={terrainRef.project}
            terrain={terrainRef.terrain}
            revision={revision}
            onAttach={(s, file) => void actions.attach(s, file)}
            onRemove={(s) => void actions.remove(s)}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-[11px] text-muted-foreground">Resolution</span>
          <IconSelect
            options={RESOLUTION_OPTIONS}
            value={String(spec.resolution)}
            icon={LuGrid3X3}
            label="Resolution"
            description="Vertices per side of the heightfield."
            onChange={(next) => void actions.setSpec({ resolution: Number(next) })}
          />
        </div>
        <MetresRow label="World size" value={spec.worldSize} min={16} max={65_536} onCommit={(worldSize) => void actions.setSpec({ worldSize })} />
        <div className="flex items-center gap-1.5">
          <span className="w-20 shrink-0 text-[11px] text-muted-foreground">Height range</span>
          <NumberField
            label="Height minimum"
            value={spec.heightRange[0]}
            step={1}
            onCommit={(min) => min !== undefined && min < spec.heightRange[1] && void actions.setSpec({ heightRange: [min, spec.heightRange[1]] })}
          />
          <NumberField
            label="Height maximum"
            value={spec.heightRange[1]}
            step={1}
            onCommit={(max) => max !== undefined && max > spec.heightRange[0] && void actions.setSpec({ heightRange: [spec.heightRange[0], max] })}
          />
          <span className="text-[11px] text-muted-foreground">m</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {actions.building ? (
          <button
            type="button"
            onClick={() => void actions.cancel()}
            className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-border text-xs font-medium hover:bg-primary/10"
          >
            <LuSquare aria-hidden className="h-3.5 w-3.5" />
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void generate()}
            className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Generate
          </button>
        )}
        {actions.building ? (
          <div className="flex flex-col gap-1" aria-live="polite">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Spinner />
              {progress ? STAGE_LABEL[progress.stage] : 'Starting…'}
            </div>
            <div className="h-1 overflow-hidden rounded bg-muted">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round((progress?.fraction ?? 0) * 100)}%` }} />
            </div>
          </div>
        ) : null}
        {outcome?.kind === 'needs-height-source' ? (
          <p role="status" className="text-[11px] text-amber-600 dark:text-amber-400">
            No heightmap attached. Attach one above, then Generate.
          </p>
        ) : null}
        {outcome?.kind === 'failed' ? (
          <p role="alert" className="text-[11px] text-destructive">
            {outcome.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MetresRow({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (value: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <NumberField label={label} value={value} step={16} min={min} max={max} onCommit={(next) => next !== undefined && onCommit(next)} />
      <span className="text-[11px] text-muted-foreground">m</span>
    </div>
  );
}
