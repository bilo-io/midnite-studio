import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve as resolvePath } from 'node:path';

import {
  EVENT_CHANNELS,
  failure,
  GAME_LEVEL_MAX_BYTES,
  GAME_MANIFEST_FILE,
  GameSceneNameSchema,
  ok,
  parseGameLevel,
  parseGameManifest,
  type BrowserBounds,
  type GameAddResult,
  type GameCreateRequest,
  type GameCreateResult,
  type GameDiagnosis,
  type GameDebugOptions,
  type GameFixRequest,
  type GameFixResult,
  type GameJuicePatch,
  type GameLevelPreviewResult,
  type GameJuiceSettings,
  type GameLogEntry,
  type GameManifest,
  type GameManifestIssue,
  type GamePoppedResponse,
  type GameSummary,
  type GamesSettings,
  type GamesSettingsPatch,
  type GamesSettingsRead,
  type GitOpResult,
} from '@midnite/studio-shared';

import type { Logger } from './logger';
import { diagnoseGame } from './game-doctor';
import { applyGameFix } from './game-fixes';
import { inferManifest } from './infer-manifest';
import { resolveGameFolder } from './game-open';
import { listGames } from './game-list';
import { createEntityPoller } from './game-entities';
import { createGameLevels } from './game-levels';
import { createGamePrefabs } from './game-prefabs';
import { createLevelEditorBridge } from './level-editor-bridge';
import { createGameManage } from './game-manage';
import { createGame, gameIdForPath } from './game-scaffold';
import type { GamePopout } from './game-popout';
import { gameEntryUrl, type GameRunner, type ToolbarAction } from './game-runner';
import { effectiveGamesRoot, validateGamesRoot } from './games-root';
import { expandLibraryRoot } from './asset-library';
import type { GamesSettingsStore } from './games-settings-store';
import { upgradeKit } from './kit-upgrade';

export type GameServiceDeps = {
  settings: GamesSettingsStore;
  runner: GameRunner;
  /** `templates/media-game/`. */
  templateDir: string;
  /** `resources/game-engines/`. */
  enginesDir: string;
  /** Register a new repo with the app's repo list and reconcile its watchers. */
  registerRepo: (path: string) => Promise<GitOpResult>;
  /** Paths of every repo the app has registered. */
  listRepoPaths: () => Promise<string[]>;
  /** The Open Game folder dialog, owned by the host's main process: an absolute path, or null when dismissed. */
  pickFolder?: () => Promise<string | null>;
  /** Push an event to the renderer(s). */
  send: (channel: string, payload: unknown) => void;
  log: Logger;
  /** Game management (Phase 149 Theme I): the host's ports. Each absent one makes its op answer "not available". */
  forgetRepo?: (path: string) => Promise<GitOpResult>;
  revealPath?: (path: string) => void;
  trashPath?: (path: string) => Promise<GitOpResult>;
  /** Pop out (Theme B). Absent in tests that never pop a game out. */
  popout?: GamePopout;
  /** Where games live until the user picks a folder. Defaults to `~/Midnite Games`; a smoke run points it at its userData. */
  defaultRoot?: string;
};

/**
 * The one implementation IPC (and, in a later theme, MCP) calls. Handlers are
 * thin adapters over it. Every op answers a `GitOpResult`; nothing throws.
 */
export function createGameService(deps: GameServiceDeps) {
  const read = async (): Promise<{ settings: GamesSettings; root: string }> => {
    const settings = await deps.settings.load();
    return { settings, root: effectiveGamesRoot(settings.gamesRoot, deps.defaultRoot) };
  };

  async function settingsRead(): Promise<GamesSettingsRead> {
    const { settings, root } = await read();
    return { settings, resolvedRoot: root, rootProblem: await validateGamesRoot(root), resolvedLibraryRoot: expandLibraryRoot(settings.assetLibraryRoot) };
  }

  /** Find a listed game by id. */
  async function find(gameId: string): Promise<GameSummary | null> {
    const { root } = await read();
    const games = await listGames(root, await deps.listRepoPaths(), { diagnose: false });
    return games.find((game) => game.gameId === gameId) ?? null;
  }

  async function readManifest(path: string): Promise<{ manifest: GameManifest | null; issues: GameManifestIssue[] }> {
    let value: unknown;
    try {
      value = JSON.parse(await readFile(join(path, GAME_MANIFEST_FILE), 'utf8'));
    } catch (error) {
      return { manifest: null, issues: [{ path: '(root)', message: error instanceof Error ? error.message : String(error) }] };
    }
    const parsed = parseGameManifest(value);
    return parsed.ok ? { manifest: parsed.manifest, issues: [] } : { manifest: null, issues: parsed.issues };
  }

  /**
   * A game by `gameId` or absolute path (the MCP addressing). A path outside the
   * games location that is not a registered repo is not a game: it never reaches
   * the filesystem beyond the listing.
   */
  async function resolve(target: string): Promise<GameSummary | null> {
    const { root } = await read();
    const games = await listGames(root, await deps.listRepoPaths(), { diagnose: false });
    if (!isAbsolute(target)) return games.find((game) => game.gameId === target) ?? null;
    const wanted = resolvePath(target);
    return games.find((game) => resolvePath(game.path) === wanted) ?? null;
  }

  const levelEditor = createLevelEditorBridge({ send: deps.send });
  const prefabs = createGamePrefabs({ resolve, send: deps.send, log: deps.log });
  const entityPoller = createEntityPoller({ read: (gameId) => deps.runner.entities(gameId), runState: (gameId) => deps.runner.runState(gameId), send: deps.send });
  const levels = createGameLevels({
    resolve,
    readManifest,
    runner: deps.runner,
    onLevelSave: (gameId, scene) => deps.runner.clearPreview(gameId, scene),
    send: deps.send,
    log: deps.log,
  });

  const manage = createGameManage({
    resolve,
    gamesRoot: async () => (await read()).root,
    isRunning: (gameId) => deps.runner.isRunning(gameId),
    stop: (gameId) => deps.runner.stop(gameId),
    ...(deps.forgetRepo ? { forgetRepo: deps.forgetRepo } : {}),
    registerRepo: deps.registerRepo,
    ...(deps.revealPath ? { revealPath: deps.revealPath } : {}),
    ...(deps.trashPath ? { trashPath: deps.trashPath } : {}),
    send: deps.send,
    log: deps.log,
  });

  /**
   * Play from here (Phase 140 Theme B): run the editor's unsaved `level` for `scene` from `spawn`, through the
   * runner's in-memory overlay. Nothing is written or committed; a running game restarts, a stopped one starts.
   */
  async function previewLevel(req: {
    gameId: string;
    scene: string;
    level: unknown;
    spawn: { x: number; y: number; z?: number } | null;
  }): Promise<GitOpResult<GameLevelPreviewResult>> {
    const scene = GameSceneNameSchema.safeParse(req.scene);
    if (!scene.success) return failure(`"${req.scene}" is not a scene name.`);
    const parsed = parseGameLevel(req.level);
    if (!parsed.ok) {
      const first = parsed.issues[0];
      return failure(first ? `${first.path}: ${first.message}` : 'That is not a valid level.');
    }
    const json = `${JSON.stringify(req.level, null, 2)}\n`;
    if (Buffer.byteLength(json) > GAME_LEVEL_MAX_BYTES) return failure(`That level is over ${GAME_LEVEL_MAX_BYTES / 1048576} MB.`);
    const via = deps.runner.isRunning(req.gameId) ? ('restarted' as const) : ('started' as const);
    const started = await service.run(req.gameId, { level: scene.data, spawn: req.spawn, preview: { scene: scene.data, json } });
    if (!started.ok) return started;
    return ok({ url: gameEntryUrl({ gameId: req.gameId, determinism: null, level: scene.data, spawn: req.spawn }), via });
  }

  const service = {
    resolve,
    view: (gameId: string) => deps.runner.view(gameId),
    isRunning: (gameId: string): boolean => deps.runner.isRunning(gameId),
    emit: (channel: string, payload: unknown): void => deps.send(channel, payload),

    settings: {
      get: settingsRead,

      async set(patch: GamesSettingsPatch): Promise<GitOpResult<GamesSettingsRead>> {
        const current = await deps.settings.load();
        const next: GamesSettings = { ...current, ...patch, version: 1 };
        if (typeof next.gamesRoot === 'string') {
          const problem = await validateGamesRoot(next.gamesRoot);
          if (problem !== null) return failure(problem);
        }
        await deps.settings.save(next);
        return ok(await settingsRead());
      },
    },

    async list(): Promise<GameSummary[]> {
      const { root } = await read();
      return listGames(root, await deps.listRepoPaths());
    },

    async create(req: GameCreateRequest): Promise<GitOpResult<GameCreateResult>> {
      const { settings, root } = await read();
      const result = await createGame(req, {
        templateDir: deps.templateDir,
        enginesDir: deps.enginesDir,
        gamesRoot: root,
        defaultNetwork: settings.defaultNetwork,
        registerRepo: deps.registerRepo,
      });
      if (result.ok) {
        deps.send(EVENT_CHANNELS.gamesChanged, { reason: 'created' });
        deps.log.info(`game created ${result.value.gameId} path=${result.value.path}`);
      }
      return result;
    },

    /**
     * Open Game (Phase 132 Theme A): add an existing game folder to the list. `path` absent shows the host's
     * folder dialog. A game already listed answers `listed` and nothing is written.
     */
    async add(path?: string, confirmManifest?: GameManifest): Promise<GitOpResult<GameAddResult>> {
      let picked = path;
      if (picked === undefined) {
        if (!deps.pickFolder) return failure('Open Game is not available here.');
        const answer = await deps.pickFolder();
        if (answer === null) return ok({ status: 'cancelled' });
        picked = answer;
      }
      const resolved = await resolveGameFolder(picked);
      if (!resolved.ok) return resolved;
      const { root } = resolved.value;
      const { root: gamesRoot } = await read();
      const real = await realpath(root).catch(() => root);
      const games = await listGames(gamesRoot, await deps.listRepoPaths(), { diagnose: false });
      for (const game of games) {
        if ((await realpath(game.path).catch(() => game.path)) === real) {
          return ok({ status: 'listed', gameId: game.gameId, path: game.path });
        }
      }
      if (resolved.value.needsManifest) {
        // Phase 149 Theme F: nothing is written or registered until the user confirms a manifest.
        if (confirmManifest === undefined) {
          const proposed = await inferManifest(root);
          if (!proposed.ok) return proposed;
          return ok({ status: 'needs-manifest', path: root, proposed: proposed.value, diagnosis: await diagnoseGame(root) });
        }
        const written = await applyGameFix(root, { fixId: 'write-manifest', manifest: confirmManifest }, { templateDir: deps.templateDir, enginesDir: deps.enginesDir, send: deps.send });
        if (!written.ok) return written;
      }
      const registered = await deps.registerRepo(root);
      if (!registered.ok) return registered;
      deps.send(EVENT_CHANNELS.gamesChanged, { reason: 'added' });
      const gameId = await gameIdForPath(root);
      deps.log.info(`game added ${gameId} path=${root}`);
      return ok({ status: 'added', gameId, path: root });
    },

    /** Rename, forget, reveal and delete-to-Trash (Phase 149 Theme I). */
    rename: manage.rename,
    forget: manage.forget,
    reveal: manage.reveal,
    deleteInfo: manage.deleteInfo,
    delete: manage.delete,

    async manifestGet(gameId: string): Promise<{ manifest: GameManifest | null; issues: GameManifestIssue[] }> {
      const game = await find(gameId);
      if (!game) return { manifest: null, issues: [{ path: '(root)', message: 'That game was not found.' }] };
      return readManifest(game.path);
    },

    async manifestSet(gameId: string, patch: Record<string, unknown>): Promise<GitOpResult> {
      const game = await find(gameId);
      if (!game) return failure('That game was not found.');
      let current: Record<string, unknown>;
      try {
        current = JSON.parse(await readFile(join(game.path, GAME_MANIFEST_FILE), 'utf8')) as Record<string, unknown>;
      } catch (error) {
        return failure(`Could not read ${GAME_MANIFEST_FILE}: ${error instanceof Error ? error.message : String(error)}`);
      }
      const merged = { ...current, ...patch };
      const parsed = parseGameManifest(merged);
      if (!parsed.ok) {
        const first = parsed.issues[0];
        return failure(first ? `${first.path}: ${first.message}` : 'That would make the manifest invalid.');
      }
      try {
        await writeFile(join(game.path, GAME_MANIFEST_FILE), `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
      } catch (error) {
        return failure(`Could not write ${GAME_MANIFEST_FILE}: ${error instanceof Error ? error.message : String(error)}`);
      }
      deps.send(EVENT_CHANNELS.gamesChanged, { reason: 'manifest' });
      return ok();
    },

    /**
     * Run a game. A manifest with `deterministic: true` runs deterministically (seed 1);
     * `opts.determinism` forces it for this run — what a play-test does.
     */
    async run(
      gameId: string,
      opts: {
        determinism?: { seed: number; paused: boolean };
        level?: string;
        spawn?: { x: number; y: number; z?: number } | null;
        preview?: { scene: string; json: string } | null;
      } = {},
    ): Promise<GitOpResult<{ runId: string }>> {
      const game = await find(gameId);
      if (!game) return failure('That game was not found.');
      const { manifest, issues } = await readManifest(game.path);
      if (!manifest) {
        const first = issues[0];
        return failure(`${GAME_MANIFEST_FILE} is invalid${first ? ` (${first.path}: ${first.message})` : ''}.`);
      }
      return deps.runner.run({
        gameId,
        root: game.path,
        build: manifest.build ?? null,
        network: manifest.network,
        keepSaveData: manifest.keepSaveData,
        determinism: opts.determinism ?? (manifest.deterministic ? { seed: 1, paused: false } : null),
        ...(opts.level ? { level: opts.level } : {}),
        ...(opts.spawn ? { spawn: opts.spawn } : {}),
        ...(opts.preview ? { preview: opts.preview } : {}),
      });
    },

    stop(gameId: string): GitOpResult {
      deps.runner.stop(gameId);
      return ok();
    },
    reload: (gameId: string): GitOpResult => deps.runner.reload(gameId),
    setBounds: (gameId: string, bounds: BrowserBounds): void => deps.runner.setBounds(gameId, bounds),
    setVisible: (gameId: string, visible: boolean): void => deps.runner.setVisible(gameId, visible),
    toolbar: (gameId: string, action: ToolbarAction, value?: string | number | boolean): Promise<GitOpResult> =>
      deps.runner.toolbar(gameId, action, value),
    juice: (gameId: string, action: 'get' | 'set' | 'reset', patch?: GameJuicePatch): Promise<GitOpResult<GameJuiceSettings>> =>
      deps.runner.juice(gameId, action, patch),
    logs: (gameId: string, since?: number): { runId: string | null; entries: GameLogEntry[] } =>
      deps.runner.logs(gameId, since),
    /** `levels/<scene>.tmj` (Phase 132 Theme C): list, read, write-and-commit; and the jump to a scene. */
    levels: {
      list: levels.list,
      get: levels.get,
      set: levels.set,
      mapAsset: levels.mapAsset,
      model: levels.model,
      prefabs,
      assetThumb: levels.assetThumb,
      terrainDetail: levels.terrainDetail,
      preview: (req: { gameId: string; scene: string; level: unknown; spawn: { x: number; y: number; z?: number } | null }) => previewLevel(req),
      previewEnd: (gameId: string): GitOpResult => {
        deps.runner.clearPreview(gameId);
        return ok();
      },
    },
    goto: levels.goto,
    /** Live entities (Phase 140 Theme D): one read, and the editor's subscription to the 4 Hz poller. */
    entities: {
      get: (gameId: string) => deps.runner.entities(gameId),
      watch: (gameId: string, watcherId: string, on: boolean): GitOpResult => {
        entityPoller.watch(gameId, watcherId, on);
        return ok();
      },
    },
    /** Phase 140 Theme G: the running game's debug overlays, and its nav-mesh for the editor. */
    debug: (gameId: string, patch: Partial<GameDebugOptions>) => deps.runner.debug(gameId, patch),
    navMesh: (gameId: string) => deps.runner.navMesh(gameId),
    /** The main -> renderer level-editor bridge (Phase 138 Theme C). */
    levelEditor,
    async kitUpgrade(gameId: string): Promise<GitOpResult<{ branch: string }>> {
      const game = await find(gameId);
      if (!game) return failure('That game was not found.');
      const result = await upgradeKit(game.path, {
        templateDir: deps.templateDir,
        enginesDir: deps.enginesDir,
        onBranchOpened: () => {
          deps.send(EVENT_CHANNELS.gamesChanged, { reason: 'manifest' });
        },
      });
      if (result.ok) {
        deps.log.info(`game kit upgraded ${gameId} branch=${result.value.branch}`);
      }
      return result;
    },
    stopAll: (): void => {
      entityPoller.stopAll();
      deps.runner.stopAll();
    },

    // --- Phase 149 Theme C: the game doctor ---
    /**
     * Diagnose a game against the Midnite game standard. `gameId` names a listed game; `path` (Open Game, before
     * the folder is listed) must be an existing absolute directory. Read-only.
     */
    async doctor(req: { gameId?: string; path?: string }): Promise<GitOpResult<GameDiagnosis>> {
      if (req.gameId !== undefined) {
        const game = await resolve(req.gameId);
        if (!game) return failure('That game was not found.');
        return ok(await diagnoseGame(game.path));
      }
      if (req.path === undefined || !isAbsolute(req.path)) return failure('Give a game id or an absolute folder path.');
      let real: string;
      try {
        real = await realpath(resolvePath(req.path));
        if (!(await stat(real)).isDirectory()) return failure('That path is not a folder.');
      } catch {
        return failure('That folder does not exist.');
      }
      return ok(await diagnoseGame(real));
    },
    // --- end Phase 149 Theme C ---

    // --- Phase 149 Theme D: safe doctor fixes ---
    /** Apply one fix to a listed game (`gameId`) or an existing absolute folder (`path`); answers the fresh diagnosis. */
    async doctorFix(req: GameFixRequest): Promise<GitOpResult<GameFixResult>> {
      const { gameId, path, ...fix } = req;
      let target: string;
      if (gameId !== undefined) {
        const game = await resolve(gameId);
        if (!game) return failure('That game was not found.');
        target = game.path;
      } else {
        if (path === undefined || !isAbsolute(path)) return failure('Give a game id or an absolute folder path.');
        const top = await resolveGameFolder(path);
        if (!top.ok) return top;
        target = top.value.root;
      }
      const result = await applyGameFix(target, fix, { templateDir: deps.templateDir, enginesDir: deps.enginesDir, send: deps.send });
      if (result.ok) deps.log.info(`game doctor fix ${fix.fixId} path=${target} commit=${result.value.commit ?? 'none'}`);
      return result;
    },
    // --- end Phase 149 Theme D ---

    async popOut(gameId: string): Promise<GitOpResult> {
      if (!deps.popout) return failure('Pop out is not available.');
      if (!(await find(gameId))) return failure('That game was not found.');
      return deps.popout.popOut(gameId);
    },
    popped: (): GamePoppedResponse => deps.popout?.popped() ?? { gameId: null, run: null },
  };
  return service;
}

export type GameService = ReturnType<typeof createGameService>;
