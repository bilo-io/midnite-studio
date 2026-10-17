import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { createMediaService, mediaCoreMain, type MediaService } from '@midnite/studio-feature-media-core/main';
import {
  createGamesRuntime,
  mediaGameMain,
  type GameElectron,
  type GamePopoutWindow,
  type GamesRuntime,
  type GameWindow,
  type Logger,
} from '@midnite/studio-feature-media-game/main';
import { createMapRuntime, mediaMapMain, type CaptureWorkerHandle, type MapRuntime } from '@midnite/studio-feature-media-map/main';
import { createSpriteRuntime, mediaSpriteMain, type SpriteRuntime } from '@midnite/studio-feature-media-sprite/main';
import {
  bakeSplat,
  createTerrainRuntime,
  exportTerrain,
  mediaTerrainMain,
  type TerrainRuntime,
  type TerrainWorkerHandle,
} from '@midnite/studio-feature-media-terrain/main';
import { createIpcContext, type IpcContextElectron } from '@midnite/studio-runtime';
import { EVENT_CHANNELS, failure, type FfmpegStatus, type GitOpResult } from '@midnite/studio-shared';

/**
 * The one "repository" Gamer's media is scoped to. The renderer's media store addresses everything by
 * `repoId`; Gamer has no repository list, so it has one id that main resolves to its own media root
 * (`<userData>/media`, holding `.midnite/media/<tab>/`).
 */
export const GAMER_REPO_ID = 'gamer';

/** The electron pieces Gamer's main needs, injected so registration is testable under bare vitest. */
export type GamerElectron = IpcContextElectron & {
  /** The folder that holds `.midnite/media/` — `<userData>/media` in the app, a temp dir under test. */
  mediaRoot: string;
  /** Gamer's userData: the tile cache and `games-settings.json` live here. */
  userData: string;
  /** Where games live until the user picks a folder; absent = `~/Midnite Games`. A smoke run sets it inside userData. */
  defaultGamesRoot?: string;
  revealPath: (absPath: string) => void;
  pickSavePath: (options: { defaultPath: string; filters: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  /** The "Import a Tiled map" picker — an absolute path, or null when dismissed. */
  pickTiledMap: () => Promise<string | null>;
  ffmpegStatus: () => Promise<FfmpegStatus>;
  /** `net.fetch`; a test passes one that refuses the network. */
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  userAgent: string;
  /** JPEG/WebP → RGBA (`nativeImage`). */
  nativeDecode: (bytes: Uint8Array) => Promise<{ width: number; height: number; rgba: Uint8Array } | null>;
  /** Any image → PNG, with an optional downscale (`nativeImage`). */
  toPng: (bytes: Uint8Array, opts: { maxSide: number }) => Promise<{ png: Buffer; downscaledFrom?: { width: number; height: number } } | null>;
  /** `utilityProcess.fork` on the capture and terrain workers; each is forked lazily and killed on quit. */
  spawnCaptureWorker: () => CaptureWorkerHandle;
  spawnTerrainWorker: () => TerrainWorkerHandle;
  /** The games runner's Electron pieces and where the template and vendored engines live. */
  game: {
    electron: GameElectron;
    getWindow: () => GameWindow | null;
    openPopoutWindow?: () => GamePopoutWindow;
    templateDir: string;
    enginesDir: string;
  };
  log: (line: string) => void;
};

export type GamerServices = {
  media: MediaService;
  map: MapRuntime;
  terrain: TerrainRuntime;
  sprite: SpriteRuntime;
  games: GamesRuntime;
};

const notAvailable = <T>(what: string): GitOpResult<T> => failure(`${what} is not available in Midnite Gamer yet.`);

/**
 * Registers every channel Gamer's renderer can call: media-core's store, watcher and export, and the Maps,
 * Terrain, Sprites and Games features. Gamer has no vault yet, so there is no MapTiler key (keyless tile
 * sources only) and no image provider, vision model or agent — Sprites' generating methods, Terrain's
 * prompted heightmap and Games' agent loop answer "not available" rather than guess. Returns the services
 * so the caller can dispose them on quit.
 */
export function registerGamerHandlers(el: GamerElectron): GamerServices {
  const ctx = createIpcContext(el);
  const logger: Logger = Object.assign((message: string) => el.log(message), {
    info: (message: string) => el.log(message),
    warn: (message: string) => el.log(message),
    error: (message: string) => el.log(message),
  });
  const media = createMediaService({
    resolveRepo: async (repoId) => {
      if (repoId !== GAMER_REPO_ID) return null;
      await mkdir(el.mediaRoot, { recursive: true });
      return el.mediaRoot;
    },
    trash: el.trashItem,
    emit: el.send,
  });
  mediaCoreMain.register(ctx, {
    media,
    revealPath: el.revealPath,
    ffmpegStatus: el.ffmpegStatus,
    pickSavePath: el.pickSavePath,
    resolveVideoExportInput: async () => null,
  });
  const tabRoot = (tab: 'map' | 'terrain' | 'sprite') => (repoId: string) => media.store.rootFor({ repoId, tab });

  // Terrain first: a Maps capture hands its result to it.
  const terrain = createTerrainRuntime({
    rootFor: tabRoot('terrain'),
    writeBytes: (req) => media.store.writeBytes({ repoId: req.repoId, tab: 'terrain', project: req.project, path: req.path, data: req.data }),
    trash: el.trashItem,
    toPng: el.toPng,
    onChanged: (repoId) => media.notifyChanged(repoId, 'terrain'),
    emitProgress: (event) => el.send(EVENT_CHANNELS.mediaTerrainProgress, event),
    emitChanged: (event) => el.send(EVENT_CHANNELS.mediaTerrainChanged, event),
    log: el.log,
    spawnWorker: el.spawnTerrainWorker,
  });
  mediaTerrainMain.register(ctx, { service: terrain.service });

  const map = createMapRuntime({
    readText: (req) => media.store.readFile({ repoId: req.repoId, tab: 'map', project: req.project, path: req.path, encoding: 'utf8' }),
    writeText: (req) =>
      media.store.writeFile({ repoId: req.repoId, tab: 'map', project: req.project, path: req.path, content: req.content, encoding: 'utf8' }),
    rootFor: tabRoot('map'),
    userData: el.userData,
    fetch: el.fetch,
    userAgent: el.userAgent,
    // No vault in Gamer: the optional MapTiler key is absent, so only the keyless sources are usable.
    readKey: async () => null,
    nativeDecode: el.nativeDecode,
    spawnCaptureWorker: el.spawnCaptureWorker,
    terrain: terrain.service,
    emitOpen: (event) => el.send(EVENT_CHANNELS.mediaTerrainOpen, event),
    onChanged: (repoId) => media.notifyChanged(repoId, 'map'),
    emitProgress: (event) => el.send(EVENT_CHANNELS.mediaMapCaptureProgress, event),
    log: el.log,
  });
  mediaMapMain.register(ctx, { runtime: map });

  const sprite = createSpriteRuntime({
    rootFor: tabRoot('sprite'),
    writeBytes: (req) => media.store.writeBytes({ repoId: req.repoId, tab: 'sprite', project: req.project, path: req.path, data: req.data }),
    trash: el.trashItem,
    toPng: async (bytes) => (await el.toPng(bytes, { maxSide: Number.MAX_SAFE_INTEGER }))?.png ?? null,
    onChanged: (repoId) => media.notifyChanged(repoId, 'sprite'),
    emitProgress: (event) => el.send(EVENT_CHANNELS.mediaSpriteProgress, event),
    emitChanged: (event) => el.send(EVENT_CHANNELS.mediaSpriteChanged, event),
    log: el.log,
    generateImage: async () => notAvailable('Image generation'),
    visionCall: async () => notAvailable('A vision model'),
    llmCall: async () => notAvailable('A language model'),
    bakeSplat,
    terrainRootFor: tabRoot('terrain'),
    // Rendering from 3D needs the Models tab, which Gamer does not have yet: no window takes the request.
    sendRenderRequest: () => false,
  });
  mediaSpriteMain.register(ctx, { runtime: sprite, pickTiledMap: el.pickTiledMap });

  const games = createGamesRuntime({
    userData: el.userData,
    ...(el.defaultGamesRoot ? { defaultGamesRoot: el.defaultGamesRoot } : {}),
    log: logger,
    send: el.send,
    getWindow: el.game.getWindow,
    electron: el.game.electron,
    ...(el.game.openPopoutWindow ? { openPopoutWindow: el.game.openPopoutWindow } : {}),
    templateDir: el.game.templateDir,
    enginesDir: el.game.enginesDir,
    // Gamer has no repository list: a game is a folder under the games root, found by scanning it.
    registerRepo: async () => ({ ok: true }),
    listRepoPaths: async () => [],
    exportTerrain,
  });
  mediaGameMain.register(ctx, {
    runtime: games,
    log: logger,
    pickSavePath: el.pickSavePath,
  });
  return { media, map, terrain, sprite, games };
}

/** `<userData>/media` — what Gamer's `GAMER_REPO_ID` resolves to. */
export const gamerMediaRoot = (userData: string): string => join(userData, 'media');
