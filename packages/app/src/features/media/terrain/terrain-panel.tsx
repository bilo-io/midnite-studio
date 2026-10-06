import { TERRAIN_BUILD_STAGES, TERRAIN_INPUT_SLOTS, TERRAIN_RESOLUTIONS, TERRAIN_TEXTURE_SIZES, type TerrainSpec } from '@midnite/studio-shared';
import { useState, type ReactNode } from 'react';
import { LuDices, LuGrid3X3, LuSquare } from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';
import { IconSelect } from '../../../components/icon-select';
import { Spinner } from '../../../components/skeleton';
import { NumberField } from '../model/fields';
import { AlignmentControls } from './alignment-controls';
import { HeightmapPromptDialog, NoHeightmapDialog } from './no-heightmap-dialog';
import { BuildingsSection, FoliageSection, RoadsSection } from './terrain-feature-sections';
import { TerrainInputSlot } from './terrain-input-slot';
import { useTerrainActions, useTerrainProgress, type BuildOutcome, type TerrainRef } from './use-terrain';

const RESOLUTION_OPTIONS = TERRAIN_RESOLUTIONS.map((n) => ({ value: String(n), label: `${n} × ${n}`, icon: LuGrid3X3 }));
const TEXTURE_OPTIONS = TERRAIN_TEXTURE_SIZES.map((n) => ({ value: String(n), label: `${n} × ${n}`, icon: LuGrid3X3 }));

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
export function TerrainPanel({
  repoId,
  terrainRef,
  spec,
  children,
}: {
  repoId: string;
  terrainRef: TerrainRef;
  spec: TerrainSpec;
  /** Rendered under Generate: the stats readout. */
  children?: ReactNode;
}) {
  const actions = useTerrainActions(repoId, terrainRef);
  const progress = useTerrainProgress(actions.buildId);
  const [outcome, setOutcome] = useState<BuildOutcome | null>(null);
  const [asking, setAsking] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const [promptBusy, setPromptBusy] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [pickerSignal, setPickerSignal] = useState(0);
  const revision = spec.updatedAt ?? '';

  const generate = async () => {
    setOutcome(null);
    const result = await actions.generate();
    // Main decides whether there is anything to build from; the dialog just asks the question it answered.
    if (result.kind === 'needs-height-source') setAsking(true);
    else setOutcome(result);
  };
  /** A parameter change saves the spec and re-bakes; commits happen on blur or Enter, never per keystroke. */
  const commit = async (patch: Record<string, unknown>) => {
    await actions.setSpec(patch);
    // With nothing to shape the ground from yet there is nothing to re-bake; Generate asks when the time comes.
    if (spec.inputs.heightmap || spec.noise || 'noise' in patch) await generate();
  };
  const chooseNoise = async () => {
    setAsking(false);
    await commit({ noise: { kind: 'fbm', seed: Math.floor(Math.random() * 2 ** 31) } });
  };
  const noise = spec.noise;

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
            openPickerSignal={slot === 'heightmap' ? pickerSignal : 0}
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
            onChange={(next) => void commit({ resolution: Number(next) })}
          />
        </div>
        <MetresRow label="World size" value={spec.worldSize} min={16} max={65_536} onCommit={(worldSize) => void commit({ worldSize })} />
        <div className="flex items-center gap-1.5">
          <span className="w-20 shrink-0 text-[11px] text-muted-foreground">Height range</span>
          <NumberField
            label="Height minimum"
            value={spec.heightRange[0]}
            step={1}
            onCommit={(min) => min !== undefined && min < spec.heightRange[1] && void commit({ heightRange: [min, spec.heightRange[1]] })}
          />
          <NumberField
            label="Height maximum"
            value={spec.heightRange[1]}
            step={1}
            onCommit={(max) => max !== undefined && max > spec.heightRange[0] && void commit({ heightRange: [spec.heightRange[0], max] })}
          />
          <span className="text-[11px] text-muted-foreground">m</span>
        </div>
      </div>

      {spec.inputs.satellite ? (
        <div className="flex items-center gap-2 border-t border-border pt-3">
          <span className="w-20 shrink-0 text-[11px] text-muted-foreground">Texture size</span>
          <IconSelect
            options={TEXTURE_OPTIONS}
            value={String(spec.textureSize)}
            icon={LuGrid3X3}
            label="Texture size"
            description="Resolution of the drape and splat maps."
            onChange={(next) => void commit({ textureSize: Number(next) })}
          />
        </div>
      ) : null}

      {spec.inputs.satellite || spec.inputs.roads ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          {spec.inputs.satellite ? (
            <AlignmentControls
              label="Satellite"
              alignment={spec.alignment?.satellite}
              onChange={(next) => void commit({ alignment: { ...spec.alignment, satellite: next === 'satellite' ? undefined : next } })}
            />
          ) : null}
          {spec.inputs.roads ? (
            <AlignmentControls
              label="Roads"
              isRoads
              alignment={spec.alignment?.roads}
              satelliteAlignment={spec.alignment?.satellite}
              onChange={(next) => void commit({ alignment: { ...spec.alignment, roads: next } })}
            />
          ) : null}
        </div>
      ) : null}

      {spec.inputs.roads ? (
        <RoadsSection repoId={repoId} terrainRef={terrainRef} spec={spec} commit={(patch) => void commit(patch)} roadKey={actions.roadKey} />
      ) : null}

      {spec.inputs.satellite ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">Vision Relabel</span>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={spec.classes?.vision?.enabled ?? false}
                onChange={(e) =>
                  void commit({
                    classes: {
                      ...spec.classes,
                      vision: { ...spec.classes?.vision, enabled: e.target.checked },
                    },
                  })
                }
                className="h-3.5 w-3.5 rounded border-border"
              />
              Enable Ollama vision
            </label>
          </div>
        </div>
      ) : null}

      {spec.inputs.satellite ? (
        <>
          <FoliageSection spec={spec} commit={(patch) => void commit(patch)} />
          <BuildingsSection spec={spec} commit={(patch) => void commit(patch)} />
        </>
      ) : null}

      {noise ? (
        <div className="flex items-center gap-1.5 border-t border-border pt-3">
          <span className="w-20 shrink-0 text-[11px] text-muted-foreground">Seed</span>
          <NumberField label="Seed" value={noise.seed} step={1} min={0} integer onCommit={(seed) => seed !== undefined && void commit({ noise: { ...noise, seed } })} />
          <IconButton icon={LuDices} label="Re-roll seed" size="sm" onClick={() => void commit({ noise: { ...noise, seed: Math.floor(Math.random() * 2 ** 31) } })} />
        </div>
      ) : null}

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
        {outcome?.kind === 'failed' ? (
          <p role="alert" className="text-[11px] text-destructive">
            {outcome.message}
          </p>
        ) : null}
      </div>
      {children}
      <NoHeightmapDialog
        open={asking}
        onUseNoise={() => void chooseNoise()}
        onUpload={() => {
          setAsking(false);
          setPickerSignal((n) => n + 1);
        }}
        onPrompt={() => {
          setAsking(false);
          setPromptError(null);
          setPrompting(true);
        }}
        onCancel={() => setAsking(false)}
      />
      <HeightmapPromptDialog
        open={prompting}
        busy={promptBusy}
        error={promptError}
        onCancel={() => setPrompting(false)}
        onSubmit={async (req) => {
          setPromptBusy(true);
          setPromptError(null);
          const result = await actions.attachFromPrompt(req);
          setPromptBusy(false);
          if (result.ok) setPrompting(false);
          else setPromptError(result.kind === 'error' ? result.message : 'Could not generate a heightmap.');
        }}
      />
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
