import type { TerrainSpec, TerrainStats } from '@midnite/studio-shared';
import { useMemo, useState } from 'react';

import { EmptyState } from '../../../components/empty-state';
import { Spinner } from '../../../components/skeleton';
import { useUiStore } from '../../../store/ui-store';
import { MediaLayout } from '../media-layout';
import type { MediaSelection } from '../media-projects-accordion';
import { MEDIA_TAB_META } from '../media-tabs';
import { NoRepoMediaState } from '../repo-media-tab';
import { TerrainExplorer, terrainOfPath } from './terrain-explorer';
import { TerrainPanel } from './terrain-panel';
import { useTerrain, useTerrainChangedInvalidation, type TerrainRef } from './use-terrain';

/**
 * Media ▸ Terrain: the explorer of terrains on the left, the viewport in the middle and the inputs
 * and parameters on the right. A terrain is a folder under `.midnite/media/terrain/<group>/`; the
 * build runs in a utility process and writes `build/` beside the spec.
 *
 * The viewport itself is Theme D's; until it lands the centre reports what was built.
 */
export function TerrainTab() {
  const repoId = useUiStore((s) => s.selectedRepoId);
  if (!repoId) return <NoRepoMediaState tab="terrain" />;
  return <TerrainTabBody repoId={repoId} />;
}

function TerrainTabBody({ repoId }: { repoId: string }) {
  const [selection, setSelection] = useState<MediaSelection | null>(null);
  useTerrainChangedInvalidation(repoId);
  const ref = useMemo<TerrainRef | null>(
    () => (selection?.path ? { project: selection.project, terrain: terrainOfPath(selection.path) } : null),
    [selection],
  );
  const terrain = useTerrain(repoId, ref);

  const centre = !ref ? (
    <EmptyState icon={MEDIA_TAB_META.terrain.icon} title="Select a terrain" body="Pick one on the left, or create a new one." />
  ) : terrain.isPending ? (
    <div className="flex h-full items-center justify-center">
      <Spinner />
    </div>
  ) : terrain.isError ? (
    <EmptyState title="Could not read this terrain" body={terrain.error.message} />
  ) : (
    <TerrainSummary spec={terrain.data.spec} built={terrain.data.built} />
  );

  return (
    <MediaLayout
      tab="terrain"
      explorerName="terrains"
      detailName="inputs"
      explorer={<TerrainExplorer repoId={repoId} selection={selection} onSelect={setSelection} />}
      content={centre}
      detail={
        ref && terrain.data ? (
          <TerrainPanel key={`${ref.project}/${ref.terrain}`} repoId={repoId} terrainRef={ref} spec={terrain.data.spec} />
        ) : (
          <EmptyState title="Nothing selected" body="The inputs of the selected terrain appear here." />
        )
      }
    />
  );
}

/** What the last build made. Theme D replaces this with the 3D viewport and its stats readout. */
function TerrainSummary({ spec, built }: { spec: TerrainSpec; built: boolean }) {
  const stats = spec.lastBuild?.stats;
  if (!built || !stats) {
    return (
      <EmptyState
        icon={MEDIA_TAB_META.terrain.icon}
        title={spec.name}
        body="Nothing built yet. Attach images or choose noise, then Generate."
      />
    );
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6" data-testid="terrain-summary">
      <h2 className="text-sm font-semibold">{spec.name}</h2>
      <StatsList stats={stats} />
      {stats.warnings.length > 0 ? (
        <ul className="max-w-sm list-disc pl-4 text-xs text-amber-600 dark:text-amber-400">
          {stats.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function StatsList({ stats }: { stats: TerrainStats }) {
  const rows: Array<[string, string]> = [
    ['Grid', `${stats.resolution} × ${stats.resolution}`],
    ['Extent', `${stats.worldSize.toLocaleString()} m`],
    ['Vertices', stats.vertexCount.toLocaleString()],
    ['Triangles', stats.triangleCount.toLocaleString()],
    ['Chunks', `${stats.chunkCount} · ${stats.lodCount} LODs`],
    ['Built in', `${stats.buildMs.toLocaleString()} ms`],
    ['Height', `${stats.minHeight.toFixed(1)} to ${stats.maxHeight.toFixed(1)} m`],
  ];
  return (
    <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-xs">
      {rows.map(([name, value]) => (
        <div key={name} className="contents">
          <dt className="text-muted-foreground">{name}</dt>
          <dd className="tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
