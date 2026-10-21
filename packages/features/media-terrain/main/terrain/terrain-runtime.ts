import { createTerrainBroker, type TerrainBroker, type TerrainWorkerHandle } from './terrain-broker';
import { createTerrainService, type TerrainService, type TerrainServiceDeps } from './terrain-service';

/**
 * What the Terrain feature's main half needs from the app that composes it (Phase 113 Theme S): the
 * service's own deps (the media store's `terrain` tab, the Trash, `nativeImage`'s PNG conversion, the
 * heightmap generator, the window events) plus how to fork the build worker (`utilityProcess.fork` in an
 * app). Nothing here is `electron`; the broker is built here from the spawn it is given.
 */
export type TerrainRuntimeDeps = Omit<TerrainServiceDeps, 'broker'> & {
  /** Forks the build worker. Called lazily, once per build. */
  spawnWorker: () => TerrainWorkerHandle;
};

export type TerrainRuntime = {
  service: TerrainService;
  broker: TerrainBroker;
  /** Ends the worker on quit, failing any build still outstanding. */
  dispose(): void;
};

/** The one wiring of Terrain's services, shared by Studio's desktop and Gamer — what `media-terrain-handlers.ts` was. */
export function createTerrainRuntime({ spawnWorker, ...deps }: TerrainRuntimeDeps): TerrainRuntime {
  const broker = createTerrainBroker({ spawn: spawnWorker });
  const service = createTerrainService({ ...deps, broker });
  return { service, broker, dispose: () => broker.dispose() };
}
