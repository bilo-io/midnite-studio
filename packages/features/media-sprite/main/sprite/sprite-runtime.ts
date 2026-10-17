import { SPRITE_FRAME_SOURCES_PENDING, type SpriteRenderRequestEvent } from '@midnite/studio-shared';

import { backgroundPreflight, createBackgroundRunner, createPropsRunner, propsPreflight } from './environment';
import { createHandDrawnRunner, handDrawnPreflight } from './hand-drawn';
import { createMapRunner, mapPreflight } from './map-generate';
import { createOneShotRunner, oneShotPreflight } from './one-shot';
import type { BakeSplat, GenerateImage, LlmCall, VisionCall } from './ports';
import { createRenderedRunner } from './rendered';
import { createRenderRelay, type RenderRelay } from './render-relay';
import { createSpriteService, type SpriteJobRunner, type SpriteService, type SpriteServiceDeps } from './sprite-service';
import { readTerrainSource } from './terrain-source';
import { createTilesetRunner, tilesetPreflight } from './tileset';

/**
 * Everything the Sprite feature's main half needs from the app that composes it (Phase 113 Theme S).
 *
 * The media store and Electron-bound pieces (`toPng` from `nativeImage`, the Trash, window events) arrive
 * as plain functions, and the three things Sprites asks of other features arrive as the structural ports
 * in `ports.ts`: the Images service's `generateImage`, the Model engines' `visionCall`/`llmCall`, and the
 * Terrain feature's `bakeSplat`. Nothing here imports `electron` or another feature, so the whole half runs
 * under bare vitest — and Studio's desktop and Gamer's main each wire their own.
 */
export type SpriteRuntimeDeps = Pick<
  SpriteServiceDeps,
  'rootFor' | 'writeBytes' | 'trash' | 'toPng' | 'onChanged' | 'emitProgress' | 'emitChanged' | 'log'
> & {
  generateImage: GenerateImage;
  visionCall: VisionCall;
  llmCall: LlmCall;
  bakeSplat: BakeSplat;
  /** The directory a repository's `terrain` media tab lives under — a terrain-to-tiles job reads from it. */
  terrainRootFor: (repoId: string) => Promise<string | null>;
  /**
   * Asks a window to render frames from 3D: delivers the request to the window's `SpriteRenderHost` and
   * answers whether any window took it. No window → false, and the job fails plainly.
   */
  sendRenderRequest: (event: SpriteRenderRequestEvent) => boolean;
};

export type SpriteRuntime = {
  service: SpriteService;
  /** The hidden-renderer protocol: `ready`/`frames` are what the two render channels call. */
  renderRelay: RenderRelay;
};

export function createSpriteRuntime(deps: SpriteRuntimeDeps): SpriteRuntime {
  const handDrawn = createHandDrawnRunner({ generateImage: deps.generateImage, visionCall: deps.visionCall });
  const renderRelay = createRenderRelay({ send: deps.sendRenderRequest });
  const rendered = createRenderedRunner(renderRelay);
  const oneShot = createOneShotRunner({ generateImage: deps.generateImage, toPng: deps.toPng });
  const environment = {
    generateImage: deps.generateImage,
    toPng: deps.toPng,
    readTerrain: async (target: { repoId: string; project: string; terrain: string }) =>
      readTerrainSource(await deps.terrainRootFor(target.repoId), target.project, target.terrain, deps.bakeSplat),
  };
  const tileset = createTilesetRunner(environment);
  const background = createBackgroundRunner(environment);
  const props = createPropsRunner(environment);
  const map = createMapRunner({ llmCall: deps.llmCall });

  const runJob: SpriteJobRunner = (ctx) => {
    if (ctx.spec.kind === 'tileset') return tileset(ctx);
    if (ctx.spec.kind === 'background') return background(ctx);
    if (ctx.spec.kind === 'prop-sheet') return props(ctx);
    if (ctx.spec.kind === 'map') return map(ctx);
    if (ctx.turnaround || (ctx.spec.kind === 'sheet' && ctx.spec.method === 'hand-drawn')) return handDrawn(ctx);
    if (ctx.spec.kind === 'sheet' && ctx.spec.method === 'rendered') return rendered(ctx);
    if (ctx.spec.kind === 'sheet' && ctx.spec.method === 'one-shot') return oneShot(ctx);
    return Promise.reject(new Error(SPRITE_FRAME_SOURCES_PENDING));
  };

  const service = createSpriteService({
    rootFor: deps.rootFor,
    writeBytes: deps.writeBytes,
    trash: deps.trash,
    toPng: deps.toPng,
    onChanged: deps.onChanged,
    emitProgress: deps.emitProgress,
    emitChanged: deps.emitChanged,
    log: deps.log,
    runJob,
    preflight: (spec, req) =>
      handDrawnPreflight(spec, req) ??
      oneShotPreflight(spec, req) ??
      tilesetPreflight(spec, req) ??
      backgroundPreflight(spec, req) ??
      propsPreflight(spec, req) ??
      mapPreflight(spec, req),
  });
  return { service, renderRelay };
}
