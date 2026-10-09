import { TERRAIN_SHADING_MODES, type TerrainSpec } from '@midnite/studio-shared';
import { useEffect, useMemo, useState } from 'react';
import { LuBrush, LuEye, LuGrid2X2, LuLayers, LuMountain, LuMove, LuRoute, LuSun, LuTrendingUp } from 'react-icons/lu';

import { EmptyState } from '../../../components/empty-state';
import { IconSelect, type IconSelectOption } from '../../../components/icon-select';
import type { IconComponent } from '../../../components/icon-button';
import { Spinner } from '../../../components/skeleton';
import { useUiStore } from '../../../store/ui-store';
import { MediaLayout } from '../media-layout';
import type { MediaSelection } from '../media-projects-accordion';
import { MEDIA_TAB_META } from '../media-tabs';
import { NoRepoMediaState } from '../repo-media-tab';
import { TerrainExportBar } from './terrain-export-bar';
import { TerrainExplorer, terrainOfPath } from './terrain-explorer';
import { TerrainPanel } from './terrain-panel';
import { SHADING_LABEL, shadingNeeds, type ShadingMode } from './terrain-shading';
import { TerrainStatsReadout } from './terrain-stats-readout';
import { LazyTerrainViewer } from './terrain-viewer-lazy';
import { useTerrainOpenRequest } from './use-terrain-agent-events';
import { useTerrain, useTerrainChangedInvalidation, type TerrainRef } from './use-terrain';

/**
 * Media ▸ Terrain: the explorer of terrains on the left, the viewport in the middle and the inputs
 * and parameters on the right. A terrain is a folder under `.midnite/media/terrain/<group>/`; the
 * build runs in a utility process and writes `build/` beside the spec.
 *
 * The centre is the lazy R3F viewport (Theme D) with a toolbar for the shading mode and the sun.
 */
export function TerrainTab() {
  const repoId = useUiStore((s) => s.selectedRepoId);
  if (!repoId) return <NoRepoMediaState tab="terrain" />;
  return <TerrainTabBody repoId={repoId} />;
}

function TerrainTabBody({ repoId }: { repoId: string }) {
  const [selection, setSelection] = useState<MediaSelection | null>(null);
  useTerrainChangedInvalidation(repoId);
  // `terrain_open` from an agent.
  const openRequest = useTerrainOpenRequest((s) => s.request);
  useEffect(() => {
    if (!openRequest || openRequest.repoId !== repoId) return;
    setSelection({ project: openRequest.project, path: `${openRequest.terrain}/terrain.json` });
    useTerrainOpenRequest.getState().clear();
  }, [openRequest, repoId]);
  const ref = useMemo<TerrainRef | null>(
    () => (selection?.path ? { project: selection.project, terrain: terrainOfPath(selection.path) } : null),
    [selection],
  );
  const terrain = useTerrain(repoId, ref);
  const [shading, setShading] = useState<ShadingMode>('shaded');
  const [timeOfDay, setTimeOfDay] = useState(10);
  const [frameMs, setFrameMs] = useState<number | null>(null);

  const centre = !ref ? (
    <EmptyState icon={MEDIA_TAB_META.terrain.icon} title="Select a terrain" body="Pick one on the left, or create a new one." />
  ) : terrain.isPending ? (
    <div className="flex h-full items-center justify-center">
      <Spinner />
    </div>
  ) : terrain.isError ? (
    <EmptyState title="Could not read this terrain" body={terrain.error.message} />
  ) : (
    <TerrainViewport
      repoId={repoId}
      terrainRef={ref!}
      spec={terrain.data.spec}
      built={terrain.data.built}
      shading={shading}
      onShading={setShading}
      timeOfDay={timeOfDay}
      onTimeOfDay={setTimeOfDay}
      onFrameMs={setFrameMs}
    />
  );

  return (
    <MediaLayout
      tab="terrain"
      explorerName="terrains"
      detailName="inputs"
      toolbar={<TerrainExportBar repoId={repoId} terrainRef={ref} built={terrain.data?.built ?? false} />}
      explorer={<TerrainExplorer repoId={repoId} selection={selection} onSelect={setSelection} />}
      content={centre}
      detail={
        ref && terrain.data ? (
          <TerrainPanel key={`${ref.project}/${ref.terrain}`} repoId={repoId} terrainRef={ref} spec={terrain.data.spec}>
            {terrain.data.built && terrain.data.spec.lastBuild ? <TerrainStatsReadout stats={terrain.data.spec.lastBuild.stats} frameMs={frameMs} /> : null}
          </TerrainPanel>
        ) : (
          <EmptyState title="Nothing selected" body="The inputs of the selected terrain appear here." />
        )
      }
    />
  );
}

const SHADING_ICON: Record<ShadingMode, IconComponent> = {
  shaded: LuEye,
  wireframe: LuGrid2X2,
  height: LuMountain,
  slope: LuTrendingUp,
  landcover: LuLayers,
  splat: LuLayers,
  roads: LuRoute,
};

/** The centre column: a toolbar over the 3D viewport, or the nothing-built-yet state. */
function TerrainViewport({
  repoId,
  terrainRef,
  spec,
  built,
  shading,
  onShading,
  timeOfDay,
  onTimeOfDay,
  onFrameMs,
}: {
  repoId: string;
  terrainRef: TerrainRef;
  spec: TerrainSpec;
  built: boolean;
  shading: ShadingMode;
  onShading: (mode: ShadingMode) => void;
  timeOfDay: number;
  onTimeOfDay: (hours: number) => void;
  onFrameMs: (ms: number) => void;
}) {
  const [align, setAlign] = useState(false);
  const [brushActive, setBrushActive] = useState(false);

  if (!built || !spec.lastBuild) {
    return (
      <EmptyState icon={MEDIA_TAB_META.terrain.icon} title={spec.name} body="Nothing built yet. Attach images or choose noise, then Generate." />
    );
  }
  const options: IconSelectOption[] = TERRAIN_SHADING_MODES.map((mode) => {
    const needs = shadingNeeds(mode, spec);
    return { value: mode, label: SHADING_LABEL[mode], icon: SHADING_ICON[mode], ...(needs ? { description: needs, disabled: true } : {}) };
  });
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="terrain-view">
      <div className="flex shrink-0 items-center gap-3 border-b border-border/50 px-2 py-1">
        <IconSelect options={options} value={shading} icon={SHADING_ICON[shading]} label="Shading" description="How the terrain is coloured." onChange={(next) => onShading(next as ShadingMode)} />
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <LuSun aria-hidden className="h-3.5 w-3.5" />
          Time of day
          <input
            type="range"
            min={0}
            max={24}
            step={0.25}
            value={timeOfDay}
            aria-label="Time of day"
            onChange={(event) => onTimeOfDay(Number(event.target.value))}
            className="w-28 accent-[hsl(var(--primary))]"
          />
          <span className="w-9 tabular-nums">{`${String(Math.floor(timeOfDay)).padStart(2, '0')}:${String(Math.round((timeOfDay % 1) * 60)).padStart(2, '0')}`}</span>
        </label>
        {spec.inputs.satellite ? (
          <div className="flex items-center gap-1 border-l border-border/50 pl-2">
            <button
              type="button"
              title="Align satellite image"
              aria-label="Align satellite image"
              onClick={() => setAlign((v) => !v)}
              className={`flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors ${
                align ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <LuMove className="h-3.5 w-3.5" />
              Align
            </button>
            <button
              type="button"
              title="Paint class (B)"
              aria-label="Paint class (B)"
              onClick={() => setBrushActive((v) => !v)}
              className={`flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors ${
                brushActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <LuBrush className="h-3.5 w-3.5" />
              Brush
            </button>
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        <LazyTerrainViewer
          repoId={repoId}
          project={terrainRef.project}
          terrain={terrainRef.terrain}
          spec={spec}
          built={built}
          shading={shading}
          timeOfDay={timeOfDay}
          onFrameMs={onFrameMs}
          align={align}
          onAlignChange={setAlign}
          brushActive={brushActive}
          onBrushActiveChange={setBrushActive}
        />
      </div>
    </div>
  );
}
