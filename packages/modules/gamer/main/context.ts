import { mkdir } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { join } from 'node:path';

import { createMediaService, mediaCoreMain, type MediaService } from '@midnite/studio-feature-media-core/main';
import {
  agyImageProvider,
  createImageService,
  createOllamaImageProvider,
  geminiImageProvider,
  imageCapableModels,
  openaiImageProvider,
} from '@midnite/studio-feature-media-images/main';
import {
  createGameAgentService,
  createGameLoop,
  createGamesRuntime,
  mediaGameMain,
  type GameAgentService,
  type GameElectron,
  type GameLoop,
  type GamePageContents,
  type GamePopoutWindow,
  type GamesRuntime,
  type GameView,
  type GameWindow,
  type Logger,
} from '@midnite/studio-feature-media-game/main';
import { createMapRuntime, mediaMapMain, type CaptureWorkerHandle, type MapRuntime } from '@midnite/studio-feature-media-map/main';
import {
  createLlmCall,
  createModelRuntime,
  createVisionCall,
  mediaModelMain,
  type ModelRuntime,
  type OllamaSeam,
} from '@midnite/studio-feature-media-model/main';
import { createSpriteRuntime, mediaSpriteMain, type SpriteRuntime } from '@midnite/studio-feature-media-sprite/main';
import {
  bakeSplat,
  createTerrainRuntime,
  exportTerrain,
  mediaTerrainMain,
  type TerrainRuntime,
  type TerrainWorkerHandle,
} from '@midnite/studio-feature-media-terrain/main';
import { ollamaChat, ollamaShow, ollamaTags, resolveOllamaBaseUrl } from '@midnite/studio-feature-models/main';
import {
  connectRuntimeVault,
  createIpcContext,
  vaultHostSocketPath,
  type FeatureMainContext,
  type IpcContextElectron,
  type IterativeHost,
  type PairingIdentity,
} from '@midnite/studio-runtime';
import { EVENT_CHANNELS, failure, MediaTabSchema, ok, type FfmpegStatus, type GitOpResult, type Sf3dRequest } from '@midnite/studio-shared';

import { createGamerKeyReader } from './keys';

import { GAMER_REPO_ID } from '../manifest';

export { GAMER_REPO_ID } from '../manifest';

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
  /**
   * The runtime's data directory, where the runtime host (Studio) serves the vault on a socket. Gamer holds
   * no cipher: the host decrypts, and the host's grants decide — so Gamer reads no key until the user grants
   * it in Vault (docs/APPS.md, "The shared data plane").
   */
  vaultDirectory: string;
  /** Gamer's pairing key (`pairing.ts`): the host serves nothing to a connection that has not proved it. */
  pairing: () => PairingIdentity | null;
  /**
   * The game agent's host (`agent-host.ts`): a private MCP server per run, Gamer's own shim, the built-in
   * roster. Absent → the agent channels answer "not available".
   */
  gameAgentHost?: IterativeHost;
  /** Whether a window is open to take a 3D render request. */
  hasWindow: () => boolean;
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
    /** A run's page — the view's `webContents`, narrowed (`main/game-electron.ts` casts it). */
    contents: (view: GameView) => GamePageContents | null;
    getWindow: () => GameWindow | null;
    openPopoutWindow?: () => GamePopoutWindow;
    templateDir: string;
    enginesDir: string;
  };
  log: (line: string) => void;
  /**
   * Further repo ids media-core resolves to this same media root: Creator's, when a host mounts both modules
   * over one `<userData>/media` and the Creator module's media-core channels are `shared` (Phase 124 Theme E.3).
   */
  extraRepoIds?: readonly string[];
  /** Resolves a Video project's output to a file for media-core's export; absent, none resolves (Gamer has no Video tab). */
  resolveVideoExportInput?: (projectId: string, name: string) => Promise<string | null>;
};

export type GamerServices = {
  media: MediaService;
  map: MapRuntime;
  terrain: TerrainRuntime;
  sprite: SpriteRuntime;
  model: ModelRuntime;
  games: GamesRuntime;
  /** Play-tests and the `game_*` tool implementations over `games`. */
  gameLoop: GameLoop;
  /** Game agent runs — present when a host was composed; `cancelAll()` on quit. */
  gameAgents: GameAgentService | null;
  /** Closes the vault connection. */
  close: () => void;
};

const notAvailable = <T>(what: string): GitOpResult<T> => failure(`${what} is not available in Midnite Gamer yet.`);

/**
 * SF3D (the opt-in local image-to-3D tier) is not in Gamer: it needs an ONNX runtime in a utility process and
 * a ~1 GB model download, which Gamer's bundle does not carry. Its status says so, which the Models panel
 * shows in place of the install button; every other op is refused.
 */
const sf3dUnavailable = async (req: Sf3dRequest): Promise<GitOpResult<unknown>> =>
  req.op === 'status'
    ? ok({ state: 'unavailable' as const, consent: null, bytesOnDisk: 0, totalBytes: 0, reason: 'SF3D is not available in Midnite Gamer. Open Midnite Studio to use it.' })
    : notAvailable('SF3D');

/**
 * Registers every channel Gamer's renderer can call: media-core's store, watcher and export, and the Maps,
 * Terrain, Sprites, Models and Games features. The few stored keys Gamer uses (MapTiler, the Gemini and
 * OpenAI image keys) are read from the runtime host's vault, as `gamer`, paired and only as far as the user
 * has granted — a denied or absent key reads as unset, so the keyless tile sources are all Maps offers and
 * Sprites' generating methods and Terrain's prompted heightmap say "not available" until it is granted. No
 * value reaches the renderer: Gamer's preload has no `secrets` namespace and no channel returns one. There
 * is no agent roster, so the Models engine is Ollama (over HTTP, no key), an agent engine answers "not
 * available". Games' play-tests run here exactly as in Studio (`createGameLoop`), and so does its agent
 * loop when a `gameAgentHost` is composed (`agent-host.ts`: a private MCP server per run, Gamer's own shim,
 * the confinement `runGameAgent` builds). Returns the services so the caller can dispose them on quit.
 */
export function registerGamerHandlers(el: GamerElectron): GamerServices {
  return registerGamerOn(createIpcContext(el), el);
}

/**
 * {@link registerGamerHandlers} over a context the caller built — what the module's main half
 * (`gamerModuleMain`) registers through, so a host can mount it beside other modules.
 */
export function registerGamerOn(ctx: FeatureMainContext, el: GamerElectron): GamerServices {
  const vault = connectRuntimeVault({ socketPath: vaultHostSocketPath(el.vaultDirectory), appId: 'gamer', identity: el.pairing });
  const readKey = createGamerKeyReader(vault);
  const logger: Logger = Object.assign((message: string) => el.log(message), {
    info: (message: string) => el.log(message),
    warn: (message: string) => el.log(message),
    error: (message: string) => el.log(message),
  });
  const media = createMediaService({
    resolveRepo: async (repoId) => {
      if (repoId !== GAMER_REPO_ID && !el.extraRepoIds?.includes(repoId)) return null;
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
    resolveVideoExportInput: el.resolveVideoExportInput ?? (async () => null),
  });
  const tabRoot = (tab: 'map' | 'terrain' | 'sprite' | 'model') => (repoId: string) => media.store.rootFor({ repoId, tab });

  // The Models engine is a local Ollama (no key); there is no agent roster, so an agent engine is refused.
  const ollamaBaseUrl = async (): Promise<string> => resolveOllamaBaseUrl();
  const ollama: OllamaSeam = {
    chat: async (req, opts) => ollamaChat(req, { baseUrl: await ollamaBaseUrl(), ...opts }),
    tags: async () => ollamaTags({ baseUrl: await ollamaBaseUrl(), timeoutMs: 1500 }),
    capabilities: async (model) => (await ollamaShow(model, { baseUrl: await ollamaBaseUrl(), timeoutMs: 1500 })).capabilities ?? [],
  };
  const model = createModelRuntime({
    rootFor: tabRoot('model'),
    createGroup: (repoId, name) => media.store.createProject({ repoId, tab: 'model', project: name }),
    trash: el.trashItem,
    author: async () => ({ name: userInfo().username || 'unknown' }),
    writeBytes: (req) => media.store.writeBytes(req),
    readBytes: (req) => media.store.readBytes(req),
    onChanged: (repoId) => media.notifyChanged(repoId, 'model'),
    emit: (event) => el.send(EVENT_CHANNELS.mediaModelProgress, event),
    ollama,
  });
  mediaModelMain.register(ctx, { runtime: model, pickSavePath: el.pickSavePath, sf3d: sf3dUnavailable });

  // Image generation (Sprites' generating methods, Terrain's prompted heightmap): the Images feature's
  // service used as a library — no tab, no channel — with its two keys read from the vault above.
  const images = createImageService({
    providers: { gemini: geminiImageProvider, openai: openaiImageProvider, agy: agyImageProvider, ollama: createOllamaImageProvider(ollamaBaseUrl) },
    readKey,
    writeFile: (req) => media.store.writeFile(req),
    emit: () => undefined,
    fetch: (input, init) => el.fetch(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, init),
    discoverOllamaModels: async () => {
      const tags = await ollamaTags({ baseUrl: await ollamaBaseUrl(), timeoutMs: 1500 });
      const shown = await Promise.all(
        tags.map(async (tag) => ({ name: tag.name, capabilities: (await ollamaShow(tag.name, { baseUrl: await ollamaBaseUrl(), timeoutMs: 1500 }).catch(() => ({ capabilities: [] as string[] }))).capabilities ?? [] })),
      );
      return imageCapableModels(shown);
    },
    // The Antigravity CLI is an agent: Gamer runs none.
    agyAvailable: async () => false,
    readReference: async (repoId, path) => {
      const [tab, project, ...rest] = path.split('/');
      const parsedTab = MediaTabSchema.safeParse(tab);
      if (!parsedTab.success || !project || rest.length === 0) return failure(`Reference ${path} is not a media file.`);
      const read = await media.store.readBytes({ repoId, tab: parsedTab.data, project, path: rest.join('/') });
      if (!read.ok) return read;
      const ext = path.split('.').pop()?.toLowerCase();
      return ok({ bytes: read.value, mime: ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png' });
    },
  });

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
    // A prompted heightmap is generated by the image service (a granted Gemini/OpenAI key, or Ollama), then
    // read back as bytes. Without a key the provider answers "add a key", which the panel shows.
    generateImage: async (req) => {
      const generated = await images.generate({ ...req, aspect: '1:1', count: 1 });
      if (!generated.ok) return generated;
      const file = generated.value.files[0];
      if (!file) return failure('The image provider returned no image.');
      const read = await media.store.readFile({ repoId: req.repoId, tab: 'image', project: req.project, path: file, encoding: 'base64' });
      if (!read.ok) return read;
      return ok({ bytes: Buffer.from(read.value, 'base64'), name: file });
    },
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
    // The optional MapTiler key, from the runtime vault once granted; absent, only the keyless sources are usable.
    readKey: () => readKey('media.mapTilerApiKey'),
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
    generateImage: (req) => images.generateImage(req),
    visionCall: createVisionCall(model.engines),
    llmCall: createLlmCall(model.engines),
    bakeSplat,
    terrainRootFor: tabRoot('terrain'),
    // Rendering from 3D: the window's `SpriteRenderHost` (mounted by `GamerApp`) draws it with the Model tab's
    // own scene code; with no window, nothing takes the request and the job fails plainly.
    sendRenderRequest: (event) => {
      if (!el.hasWindow()) return false;
      el.send(EVENT_CHANNELS.mediaSpriteRenderRequest, event);
      return true;
    },
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
  // Play-tests (Phase 107 Theme O) run here as they do in Studio: `playtests/*.json` replayed
  // deterministically through the kit hook, frame asserts, a screenshot per failure — no agent involved.
  const gameLoop = createGameLoop({ runtime: games, contents: el.game.contents });
  // Create and iterate (Phase 107 Theme M), the same service Studio runs: an agent CLI on this run's private
  // server (the host), or an Ollama model through the Model tab's engines; one commit per changing pass.
  const gameLlm = createLlmCall(model.engines);
  const gameAgents = el.gameAgentHost
    ? createGameAgentService({
        resolve: (gameId) => games.service.resolve(gameId),
        squashRunCommits: async () => (await games.service.settings.get()).settings.squashRunCommits,
        host: el.gameAgentHost,
        tools: () => gameLoop.tools,
        ollama: ({ model: ollamaModel, prompt, signal }) =>
          gameLlm({ engine: { kind: 'ollama', model: ollamaModel }, repoId: '', prompt, signal, json: true }),
        send: el.send,
        log: logger,
      })
    : null;
  mediaGameMain.register(ctx, {
    runtime: games,
    log: logger,
    pickSavePath: el.pickSavePath,
    playtests: gameLoop.playtests,
    ...(gameAgents ? { agents: gameAgents } : {}),
  });
  return { media, map, terrain, sprite, model, games, gameLoop, gameAgents, close: () => vault.close() };
}

/** `<userData>/media` — what Gamer's `GAMER_REPO_ID` resolves to. */
export const gamerMediaRoot = (userData: string): string => join(userData, 'media');
