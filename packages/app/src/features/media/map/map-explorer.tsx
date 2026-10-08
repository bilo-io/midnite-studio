import { DEFAULT_MAP_PROJECT, MAP_PROJECT_FILE } from '@midnite/studio-shared';

import { MediaProjectsAccordion, type MediaSelection } from '../media-projects-accordion';
import { MapLayerList } from './map-layer-list';
import type { MapLayers } from './use-map-layers';

/** The projects accordion lists `map.json` only — layers have their own list (Theme H), below it. */
export const isMapFile = (path: string): boolean => path === MAP_PROJECT_FILE;

/** The project a map session works in: the selected one, else the first, else `maps`. */
export const mapProjectOf = (selection: MediaSelection | null, projects: readonly { name: string }[] | undefined): string =>
  selection?.project ?? projects?.[0]?.name ?? DEFAULT_MAP_PROJECT;

/** Projects and layers: the shared projects accordion, filtered to the files a map project owns. */
export function MapExplorer({
  repoId,
  selection,
  onSelect,
  layers,
}: {
  repoId: string;
  selection: MediaSelection | null;
  onSelect: (selection: MediaSelection | null) => void;
  layers?: MapLayers;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="map-explorer">
      <div className="flex h-8 shrink-0 items-center border-b border-border px-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Maps</h2>
      </div>
      <div className="min-h-0 flex-1">
        <MediaProjectsAccordion repoId={repoId} tab="map" selection={selection} onSelect={onSelect} fileFilter={isMapFile} />
      </div>
      {layers ? <MapLayerList layers={layers} /> : null}
    </div>
  );
}
