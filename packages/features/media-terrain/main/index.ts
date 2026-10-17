import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS, failure, schemas } from '@midnite/studio-shared';

import { mediaTerrainManifest } from '../manifest';
import type { TerrainService } from './terrain/terrain-service';

export { mediaTerrainManifest, type MediaTerrainManifest } from '../manifest';
export { createTerrainRuntime, type TerrainRuntime, type TerrainRuntimeDeps } from './terrain/terrain-runtime';
export { createTerrainService, type TerrainService, type TerrainServiceDeps } from './terrain/terrain-service';
export { createTerrainBroker, terrainWorkerScriptPath, type TerrainBroker, type TerrainWorkerHandle } from './terrain/terrain-broker';
export { runTerrainBuild, plannedStages } from './terrain/build-pipeline';
export { bakeSplat, exportTerrain, loadBuilt, terrainMeshPart, type Built, type ExportTerrainArgs } from './terrain/terrain-export';
export { renderTerrainPreviews, type TerrainPreviewPicture } from './terrain/terrain-preview';
export type { VisionCall } from './terrain/vision-call';
export type { TerrainWorkerIn, TerrainWorkerOut } from './terrain/worker-protocol';

/**
 * The Terrain feature's main half (Phase 113 Theme S): `terrain.json` per terrain, the three inputs, the
 * build (in a utility process), paint, road keys and the glb / terrain-pack export. `terrain-service.ts`
 * owns every decision; this file only registers its nine channels over the service the composer built with
 * {@link createTerrainRuntime}. Nothing here imports `electron`.
 */
export type MediaTerrainMainServices = { service: TerrainService };

export const mediaTerrainMain = defineFeatureMain<MediaTerrainMainServices>({
  feature: mediaTerrainManifest.feature,
  channels: mediaTerrainManifest.ipc,
  register(ctx, { service }) {
    const { handle } = ctx.ipc;
    const invalid = (issue: string) => failure(issue);
    handle(CHANNELS.mediaTerrainLibrary, schemas.MediaTerrainLibraryRequest, (req) => service.library(req), invalid);
    handle(CHANNELS.mediaTerrainGet, schemas.MediaTerrainGetRequest, (req) => service.get(req), invalid);
    handle(CHANNELS.mediaTerrainSetSpec, schemas.MediaTerrainSetSpecRequest, (req) => service.setSpec(req), invalid);
    handle(CHANNELS.mediaTerrainSetInput, schemas.MediaTerrainSetInputRequest, (req) => service.setInput(req), invalid);
    handle(CHANNELS.mediaTerrainBuild, schemas.MediaTerrainBuildRequest, (req) => service.build(req), invalid);
    handle(CHANNELS.mediaTerrainCancel, schemas.MediaTerrainCancelRequest, ({ buildId }) => service.cancel(buildId), invalid);
    handle(CHANNELS.mediaTerrainPaint, schemas.MediaTerrainPaintRequest, (req) => service.paint(req), invalid);
    handle(CHANNELS.mediaTerrainRoadKey, schemas.MediaTerrainRoadKeyRequest, (req) => service.roadKey(req), invalid);
    handle(CHANNELS.mediaTerrainExport, schemas.MediaTerrainExportRequest, (req) => service.export(req), invalid);
  },
});
