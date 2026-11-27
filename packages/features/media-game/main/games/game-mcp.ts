import {
  EVENT_CHANNELS,
  gameEngineWarnings,
  levelEntityTypes,
  queryLevel,
  GAME_PLACEABLE_ASSET_KINDS,
  prefabFromObjects,
  scatterOps,
  type GameLevel,
  type GamePrefab,
  validateLevel,
  MCP_CONTENT_KEY,
  GameLevelSelectOutputSchema,
  LevelFrameValueSchema,
  LevelViewValueSchema,
  type GameImportAssetRequest,
  type GameImportAssetResult,
  type GameInputEvent,
  type GameLogLevel,
  type GameSummary,
  type LevelEditorRequest,
  type LevelOp,
  type McpContentBlock,
  type McpToolInput,
  type McpToolOutput,
  resolvePlayFromSpawn,
} from '@midnite/studio-shared';

import { McpToolError } from '@midnite/studio-runtime';
import type { z } from 'zod';

import { readLevelForTool } from './game-level-source';
import { groundHeights, readLevelGround } from './game-level-terrain';
import { LEVEL_EDITOR_TIMEOUT_MESSAGE, LEVEL_EDITOR_VIEW_TIMEOUT_MS } from './level-editor-bridge';
import { writeLevelOps } from './level-agent-writes';
import type { GameService } from './game-service';
import { clipError, readGameState } from './game-state';
import type { Playtests } from './playtest';

/**
 * The `game_*` MCP tools (Phase 107 Theme D): thin adapters over `GameService`
 * (the one implementation IPC also calls) plus the three things only the
 * runner's view can do — `capturePage`, `sendInputEvent` and reading the kit's
 * state. The consent gate lives in `main/mcp/game-tools.ts`; these functions
 * assume a call that reached them is allowed.
 *
 * Everything the page says is untrusted: `game_state` caps the string, parses
 * it as JSON, bounds its depth and validates it, and never evaluates it.
 */

/**
 * One native input event, the shapes of Electron's `WebContents.sendInputEvent` this file sends —
 * declared structurally, since a feature's main half never imports `electron`.
 */
export type GameNativeInputEvent =
  | { type: 'keyDown' | 'keyUp'; keyCode: string }
  | { type: 'mouseMove'; x: number; y: number }
  | { type: 'mouseDown' | 'mouseUp'; x: number; y: number; button: 'left' | 'middle' | 'right'; clickCount: number };

/** The slice of Electron's `WebContents` the tools use — a fake in tests (it was `GameWebContents` in the desktop). */
export type GamePageContents = {
  capturePage(): Promise<GameImage>;
  sendInputEvent(event: GameNativeInputEvent): void;
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
  focus(): void;
};
export type GameImage = {
  getSize(): { width: number; height: number };
  resize(opts: { width: number; height: number }): GameImage;
  toPNG(): Buffer;
};

export type GameMcpDeps = {
  service: Pick<GameService, 'resolve' | 'list' | 'levels' | 'levelEditor' | 'goto' | 'doctor' | 'doctorFix' | 'create' | 'manifestGet' | 'manifestSet' | 'run' | 'entities' | 'debug' | 'stop' | 'reload' | 'logs' | 'emit' | 'isRunning'>;
  /** The running game's web contents, or `null` when it is not running. */
  webContents: (gameId: string) => GamePageContents | null;
  /** The asset bridge's import (Theme N). */
  importAsset?: (req: GameImportAssetRequest) => Promise<{ ok: true; value: GameImportAssetResult } | { ok: false; kind: string; message?: string }>;
  /** Play-test depth (Theme O): replays, assertions and `playtests/*.json`. */
  playtests?: Playtests;
  /** Injected so tests can drive time. */
  sleep?: (ms: number) => Promise<void>;
};

export type GameMcpTools = {
  [K in
    | 'game_list'
    | 'game_create'
    | 'game_open'
    | 'game_get_manifest'
    | 'game_set_manifest'
    | 'game_run'
    | 'game_stop'
    | 'game_reload'
    | 'game_screenshot'
    | 'game_logs'
    | 'game_input'
    | 'game_state'
    | 'game_import_asset'
    | 'game_replay_record'
    | 'game_replay_play'
    | 'game_assert_state'
    | 'game_assert_frame'
    | 'game_playtest'
    | 'game_level_list'
    | 'game_level_get'
    | 'game_level_set'
    | 'game_level_query'
    | 'game_level_validate'
    | 'game_entity_batch'
    | 'game_entity_add'
    | 'game_entity_update'
    | 'game_entity_delete'
    | 'game_level_select'
    | 'game_level_frame'
    | 'game_level_view'
    | 'game_goto'
    | 'game_play_from'
    | 'game_entities'
    | 'game_debug_overlay'
    | 'game_doctor'
    | 'game_doctor_fix'
    | 'game_assets_list'
    | 'game_prefab_list'
    | 'game_prefab_save'
    | 'game_level_scatter'
    | 'game_terrain_height']: (input: McpToolInput<K>) => Promise<McpToolOutput<K>>;
};

export { GAME_STATE_TIMEOUT_MS } from './game-state';
/** After the last input event the call waits this long, so the game can react before the next screenshot. */
export const GAME_INPUT_SETTLE_MS = 100;
/** A screenshot burst stops adding frames once its base64 passes this (the response cap is 4 MB). */
export const GAME_SCREENSHOT_BYTES_MAX = 3 * 1024 * 1024;
const NOT_RUNNING = 'Run the game first.';
const notOpenMessage = (scene: string): string => `Open ${scene} in Media ▸ Games ▸ Level editor first.`;
/** `game_level_view` stops halving a too-large image at this width. */
const LEVEL_VIEW_MIN_WIDTH = 128;
const NOT_A_GAME_PATH = 'That folder is not a Midnite game.';
const NO_GAMEPAD_HOOK = 'This game has no gamepad hook (window.__midnite.input.gamepad), so gamepad events cannot be sent.';

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const clip = clipError;

/** Electron's `keyCode` for a DOM `key` value: only the space bar differs between the two vocabularies. */
export function toElectronKeyCode(key: string): string {
  return key === ' ' ? 'Space' : key;
}

/** One game input event as the `sendInputEvent` call it becomes; `null` for a gamepad event (delivered through the kit). */
export function toInputEvent(event: GameInputEvent): GameNativeInputEvent | null {
  switch (event.type) {
    case 'keyDown':
    case 'keyUp':
      return { type: event.type, keyCode: toElectronKeyCode(event.key) };
    case 'mouseMove':
      return { type: 'mouseMove', x: Math.round(event.x), y: Math.round(event.y) };
    case 'mouseDown':
    case 'mouseUp':
      return { type: event.type, x: Math.round(event.x), y: Math.round(event.y), button: event.button ?? 'left', clickCount: 1 };
    case 'gamepad':
      return null;
  }
}

export function createGameMcpTools(deps: GameMcpDeps): GameMcpTools {
  const sleep = deps.sleep ?? defaultSleep;

  /** Resolve `game` (an id or absolute path) to a listed game, or refuse with a named reason. */
  async function need(target: string): Promise<GameSummary> {
    const game = await deps.service.resolve(target);
    if (!game) {
      const isPath = target.startsWith('/') || /^[A-Za-z]:[\\/]/.test(target);
      throw new McpToolError('not-found', isPath ? NOT_A_GAME_PATH : 'That game was not found — `game_list` returns the ids.');
    }
    return game;
  }

  function running(gameId: string): GamePageContents {
    const wc = deps.webContents(gameId);
    if (!wc) throw new McpToolError('error', NOT_RUNNING);
    return wc;
  }

  const unwrap = <T>(result: { ok: true; value: T } | { ok: true } | { ok: false; kind: string; message?: string }): T => {
    if (!result.ok) throw new McpToolError('error', 'message' in result && result.message ? result.message : 'That did not work.');
    return ('value' in result ? result.value : undefined) as T;
  };

  /** A level op's failure becomes a tool error: `not-found` for a missing scene, `error` otherwise. */
  const unwrapLevel = <T>(result: { ok: true; value: T } | { ok: false; kind: string; message?: string }): T => {
    if (result.ok) return result.value;
    const text = result.message ?? 'That did not work.';
    throw new McpToolError(/no level|not found|does not exist/i.test(text) ? 'not-found' : 'error', clip(text));
  };

  /** The `game_entity_*` write path: ops from the tool's input, applied in the editor or to the file (Theme E). */
  const writeEntityOps = async (
    input: { game: string; scene: string; unit: 'px' | 'm'; label?: string | undefined; save?: boolean | undefined; select: boolean },
    ops: LevelOp[],
  ): Promise<McpToolOutput<'game_entity_batch'>> => {
    const found = await need(input.game);
    return unwrapLevel(
      await writeLevelOps(
        {
          levels: deps.service.levels,
          levelEditor: deps.service.levelEditor,
          prefab: async (gameId, name) => {
            const got = await deps.service.levels.prefabs.get(gameId, name);
            return got.ok ? got.value.prefab : null;
          },
          modelAssets: async (gameId) => {
            const { manifest } = await deps.service.manifestGet(gameId);
            return manifest ? manifest.assets.filter((a) => a.kind === 'model').map((a) => a.name) : null;
          },
          ground: async (_gameId, level) => {
            const got = await readLevelGround(found.path, (level && typeof level === 'object' ? level : {}) as Pick<GameLevel, 'properties'>);
            return got.ok ? got.ground.heightAt : null;
          },
        },
        { gameId: found.gameId, scene: input.scene, ops, unit: input.unit, label: input.label, save: input.save ?? false, select: input.select },
      ),
    );
  };

  /**
   * One request to the open Level editor (Phase 138 Themes G, H). A closed editor, an unread scene and a timeout all
   * read the same to an agent: open the scene first. A failure the renderer reports (a capture error) keeps its message.
   */
  const askEditor = async <T>(request: LevelEditorRequest, schema: z.ZodType<T>, opts?: { timeoutMs?: number }): Promise<T> => {
    const answer = await deps.service.levelEditor.request(request, opts);
    if (!answer.ok) {
      const text = 'message' in answer && answer.message ? answer.message : '';
      throw new McpToolError('error', !text || text === LEVEL_EDITOR_TIMEOUT_MESSAGE ? notOpenMessage(request.scene) : clip(text));
    }
    if (!answer.value.handled) throw new McpToolError('error', notOpenMessage(request.scene));
    const parsed = schema.safeParse(answer.value.value);
    if (!parsed.success) throw new McpToolError('error', 'The level editor answered something this build cannot read.');
    return parsed.data;
  };

  const playtests = (): Playtests => {
    if (!deps.playtests) throw new McpToolError('error', 'Play-tests are not ready yet.');
    return deps.playtests;
  };

  const readState = (wc: GamePageContents): Promise<unknown> => readGameState((code) => wc.executeJavaScript(code, false));

  return {
    async game_list() {
      return { games: await deps.service.list() };
    },

    async game_create({ writer, ...input }) {
      const created = unwrap(await deps.service.create(input));
      return { ...created, warnings: gameEngineWarnings(writer) };
    },

    async game_open({ game }) {
      const found = await need(game);
      deps.service.emit(EVENT_CHANNELS.gamesOpen, { gameId: found.gameId });
      return { opened: true as const, gameId: found.gameId };
    },

    async game_get_manifest({ game }) {
      const found = await need(game);
      const { manifest, issues } = await deps.service.manifestGet(found.gameId);
      return { gameId: found.gameId, manifest, issues };
    },

    async game_set_manifest({ game, patch }) {
      const found = await need(game);
      // `vendored` and `kitVersion` move only through the kit upgrade — never over MCP.
      const { manifest } = await deps.service.manifestGet(found.gameId);
      for (const key of ['vendored', 'kitVersion'] as const) {
        if (key in patch && JSON.stringify(patch[key]) !== JSON.stringify(manifest?.[key])) {
          throw new McpToolError('refused', `\`${key}\` can only change through Upgrade kit.`);
        }
      }
      unwrap(await deps.service.manifestSet(found.gameId, patch));
      return { ok: true as const, gameId: found.gameId };
    },

    async game_run({ game }) {
      const found = await need(game);
      const result = unwrap(await deps.service.run(found.gameId));
      return { gameId: found.gameId, runId: result.runId };
    },

    async game_stop({ game }) {
      const found = await need(game);
      deps.service.stop(found.gameId);
      return { ok: true as const, gameId: found.gameId };
    },

    async game_reload({ game }) {
      const found = await need(game);
      if (!deps.service.isRunning(found.gameId)) throw new McpToolError('error', NOT_RUNNING);
      unwrap(deps.service.reload(found.gameId));
      return { ok: true as const, gameId: found.gameId };
    },

    async game_screenshot({ game, count, intervalMs, scale }) {
      const found = await need(game);
      const wc = running(found.gameId);
      const blocks: McpContentBlock[] = [];
      let bytes = 0;
      for (let frame = 1; frame <= count; frame += 1) {
        if (frame > 1) await sleep(intervalMs);
        let png: Buffer;
        try {
          const image = await wc.capturePage();
          const { width, height } = image.getSize();
          const scaled =
            scale < 1 && width > 0 && height > 0
              ? image.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) })
              : image;
          png = scaled.toPNG();
        } catch (error) {
          throw new McpToolError('error', clip(`Could not capture the game: ${error instanceof Error ? error.message : String(error)}`));
        }
        const data = png.toString('base64');
        if (blocks.length > 0 && bytes + data.length > GAME_SCREENSHOT_BYTES_MAX) {
          blocks.push({ type: 'text', text: `Stopped after ${frame - 1} of ${count} frames: the response size limit was reached.` });
          break;
        }
        bytes += data.length;
        blocks.push({ type: 'text', text: `frame ${frame} of ${count}` }, { type: 'image', data, mimeType: 'image/png' });
      }
      return { [MCP_CONTENT_KEY]: blocks };
    },

    async game_logs({ game, since, levels, limit }) {
      const found = await need(game);
      const all = deps.service.logs(found.gameId, since).entries;
      const wanted = levels ? new Set<GameLogLevel>(levels) : null;
      const matching = wanted ? all.filter((entry) => wanted.has(entry.level)) : all;
      const entries = matching.slice(0, limit);
      // The cursor advances past what was returned only, so a capped read loses nothing.
      const last = entries.at(-1);
      const truncated = matching.length > entries.length;
      const next = last ? (truncated ? last.seq : (all.at(-1)?.seq ?? last.seq)) : (all.at(-1)?.seq ?? since ?? 0);
      return { entries, next };
    },

    async game_input({ game, events }) {
      const found = await need(game);
      const wc = running(found.gameId);
      if (events.some((event) => event.type === 'gamepad')) {
        const hooked = await wc.executeJavaScript('typeof window.__midnite?.input?.gamepad === "function"', false).catch(() => false);
        if (hooked !== true) throw new McpToolError('error', NO_GAMEPAD_HOOK);
      }
      const ordered = events.map((event, index) => ({ event, index })).sort((a, b) => a.event.t - b.event.t || a.index - b.index);
      wc.focus();
      let elapsed = 0;
      for (const { event } of ordered) {
        if (event.t > elapsed) {
          await sleep(event.t - elapsed);
          elapsed = event.t;
        }
        // The page could have been stopped mid-sequence.
        if (!deps.webContents(found.gameId)) throw new McpToolError('error', 'The game stopped while input was being sent.');
        const native = toInputEvent(event);
        if (native) wc.sendInputEvent(native);
        else if (event.type === 'gamepad') {
          await wc.executeJavaScript(`window.__midnite.input.gamepad(${event.button}, ${event.pressed ? 'true' : 'false'})`, false);
        }
      }
      await sleep(GAME_INPUT_SETTLE_MS);
      return { sent: events.length };
    },

    async game_import_asset({ game, source, name }) {
      const found = await need(game);
      if (!deps.importAsset) throw new McpToolError('error', 'The asset bridge is not ready yet.');
      const imported = unwrap(await deps.importAsset({ gameId: found.gameId, source, ...(name ? { name } : {}) }));
      return { gameId: found.gameId, ...imported };
    },

    async game_replay_record({ game, action, name, seed }) {
      return playtests().replayRecord(game, { action, ...(name ? { name } : {}), ...(seed === undefined ? {} : { seed }) });
    },

    async game_replay_play({ game, replay, speed }) {
      const played = await playtests().replayPlay(game, { replay, speed });
      return { ...played, state: played.state as McpToolOutput<'game_replay_play'>['state'] };
    },

    async game_assert_state({ game, frame, path, op, value, epsilon }) {
      return playtests().assertState(game, { frame, path, op, ...(value === undefined ? {} : { value }), ...(epsilon === undefined ? {} : { epsilon }) });
    },

    async game_assert_frame({ game, frame, name, tolerance }) {
      const { png, diffPng, ...result } = await playtests().assertFrame(game, { frame, name, tolerance });
      const blocks: McpContentBlock[] = [{ type: 'text', text: JSON.stringify(result) }];
      blocks.push({ type: 'text', text: `frame ${frame}` }, { type: 'image', data: png.toString('base64'), mimeType: 'image/png' });
      if (diffPng) blocks.push({ type: 'text', text: 'diff (changed pixels in magenta)' }, { type: 'image', data: diffPng.toString('base64'), mimeType: 'image/png' });
      return { [MCP_CONTENT_KEY]: blocks };
    },

    async game_playtest({ game, name, playtest }) {
      const { failures, ...result } = await playtests().run(game, playtest ? { inline: playtest } : name ? { names: [name] } : {});
      const blocks: McpContentBlock[] = [{ type: 'text', text: JSON.stringify(result) }];
      let bytes = 0;
      for (const png of failures) {
        const data = png.toString('base64');
        if (bytes + data.length > GAME_SCREENSHOT_BYTES_MAX) {
          blocks.push({ type: 'text', text: 'More failure images are in playtests/results/ (the response size limit was reached).' });
          break;
        }
        bytes += data.length;
        blocks.push({ type: 'image', data, mimeType: 'image/png' });
      }
      return { [MCP_CONTENT_KEY]: blocks };
    },

    async game_level_list({ game }) {
      const found = await need(game);
      return unwrapLevel(await deps.service.levels.list(found.gameId));
    },

    async game_level_get({ game, scene }) {
      const found = await need(game);
      const { level, issues } = unwrapLevel(await deps.service.levels.get(found.gameId, scene));
      return { level, issues };
    },

    async game_level_set({ game, scene, level, create }) {
      const found = await need(game);
      const written = unwrapLevel(await deps.service.levels.set(found.gameId, scene, level, create === undefined ? {} : { create }));
      return { ok: true as const, gameId: found.gameId, sha: written.sha };
    },

    async game_level_query({ game, scene, ...query }) {
      const found = await need(game);
      const read = unwrapLevel(await readLevelForTool(deps.service, found.gameId, scene));
      return { source: read.source, dirty: read.dirty, ...queryLevel(read.level, query) };
    },

    async game_entity_batch(input) {
      return writeEntityOps(input, input.ops);
    },

    async game_entity_add(input) {
      return writeEntityOps(
        input,
        input.entities.map((entity): LevelOp => ({ op: 'add', entity, ...(input.layer === undefined ? {} : { layer: input.layer }), ...(input.snap ? { snap: input.snap } : {}) })),
      );
    },

    async game_entity_update(input) {
      return writeEntityOps(
        input,
        input.updates.map((u): LevelOp => ({ op: 'update', id: u.id, set: u.set, ...(u.unset ? { unset: u.unset } : {}), ...(u.snap ? { snap: u.snap } : {}) })),
      );
    },

    async game_entity_delete(input) {
      return writeEntityOps(
        input,
        input.ids.map((id): LevelOp => ({ op: 'delete', id })),
      );
    },

    async game_level_select({ game, scene, ids, frame }) {
      const found = await need(game);
      return askEditor({ kind: 'select', gameId: found.gameId, scene, ids, frame }, GameLevelSelectOutputSchema);
    },

    async game_level_frame({ game, scene, ids, region }) {
      const found = await need(game);
      const framed = await askEditor(
        { kind: 'frame', gameId: found.gameId, scene, ...(ids === undefined ? {} : { ids }), ...(region === undefined ? {} : { region }) },
        LevelFrameValueSchema,
      );
      return { framed: true as const, view: framed.view };
    },

    async game_level_view({ game, scene, view, camera, preset, width, height }) {
      const found = await need(game);
      let w = width;
      let h = height;
      for (;;) {
        const seen = await askEditor(
          { kind: 'view', gameId: found.gameId, scene, view, ...(camera === undefined ? {} : { camera }), preset, width: w, height: h },
          LevelViewValueSchema,
          { timeoutMs: LEVEL_EDITOR_VIEW_TIMEOUT_MS },
        );
        // The response cap is on the base64; an over-size image is asked for again at half the size.
        if (seen.png.length > GAME_SCREENSHOT_BYTES_MAX) {
          if (w <= LEVEL_VIEW_MIN_WIDTH) throw new McpToolError('error', 'The level image is larger than the response limit even when small.');
          w = Math.max(LEVEL_VIEW_MIN_WIDTH, Math.floor(w / 2));
          h = Math.max(LEVEL_VIEW_MIN_WIDTH, Math.floor(h / 2));
          continue;
        }
        const summary = { view: seen.view, camera: seen.camera, objects: seen.objects, width: seen.width, height: seen.height };
        return { [MCP_CONTENT_KEY]: [{ type: 'text', text: JSON.stringify(summary) }, { type: 'image', data: seen.png, mimeType: 'image/png' }] satisfies McpContentBlock[] };
      }
    },

    async game_level_validate({ game, scene }) {
      const found = await need(game);
      const read = unwrapLevel(await readLevelForTool(deps.service, found.gameId, scene));
      const { manifest } = await deps.service.manifestGet(found.gameId);
      const modelAssets = manifest ? manifest.assets.filter((a) => a.kind === 'model').map((a) => a.name) : null;
      const issues = validateLevel(read.level, { entityTypes: levelEntityTypes(read.level), modelAssets });
      const counts = { error: 0, warning: 0, info: 0 };
      for (const issue of issues) counts[issue.severity]++;
      return { source: read.source, counts, issues };
    },

    async game_goto({ game, scene }) {
      const found = await need(game);
      const jumped = unwrapLevel(await deps.service.goto(found.gameId, scene));
      return { gameId: found.gameId, via: jumped.via };
    },

    async game_play_from({ game, scene, at, objectId, unit, useEditor }) {
      const found = await need(game);
      let read: { level: unknown; source: 'editor' | 'file' };
      if (useEditor) read = unwrapLevel(await readLevelForTool(deps.service, found.gameId, scene));
      else read = { level: unwrapLevel(await deps.service.levels.get(found.gameId, scene)).level, source: 'file' };
      const start = resolvePlayFromSpawn(read.level, { at, objectId, unit });
      if ('error' in start) throw new McpToolError('not-found', start.error);
      const previewed = unwrapLevel(await deps.service.levels.preview({ gameId: found.gameId, scene, level: read.level, spawn: start.spawn }));
      return { url: previewed.url, via: previewed.via, source: read.source };
    },

    async game_entities({ game, types, limit }) {
      const found = await need(game);
      if (!deps.service.isRunning(found.gameId)) throw new McpToolError('error', NOT_RUNNING);
      const result = unwrap(await deps.service.entities.get(found.gameId));
      const wanted = types && types.length > 0 ? result.entities.filter((e) => types.includes(e.type)) : result.entities;
      const entities = wanted.slice(0, limit);
      return { ...result, entities, truncated: result.truncated || wanted.length > entities.length };
    },

    async game_debug_overlay({ game, colliders, triggers, nav }) {
      const found = await need(game);
      if (!deps.service.isRunning(found.gameId)) throw new McpToolError('error', NOT_RUNNING);
      const patch = { ...(colliders === undefined ? {} : { colliders }), ...(triggers === undefined ? {} : { triggers }), ...(nav === undefined ? {} : { nav }) };
      return { applied: unwrap(await deps.service.debug(found.gameId, patch)) };
    },

    async game_doctor({ game }) {
      const found = await need(game);
      // By path: `need` already resolved the game, so this skips a second listing.
      return unwrap(await deps.service.doctor({ path: found.path }));
    },

    async game_doctor_fix({ game, fixId, genre, build }) {
      const found = await need(game);
      return unwrap(await deps.service.doctorFix({ path: found.path, fixId, genre, build }));
    },

    async game_assets_list({ game, kinds }) {
      const found = await need(game);
      const { manifest } = await deps.service.manifestGet(found.gameId);
      const placeable = GAME_PLACEABLE_ASSET_KINDS as readonly string[];
      const assets = (manifest?.assets ?? [])
        .filter((a) => !kinds || kinds.includes(a.kind))
        .map((a) => ({ name: a.name, kind: a.kind, path: a.path, placeable: placeable.includes(a.kind) }));
      return { assets };
    },

    async game_prefab_list({ game }) {
      const found = await need(game);
      return unwrapLevel(await deps.service.levels.prefabs.list(found.gameId));
    },

    async game_prefab_save({ game, name, dimension, objects, description }) {
      const found = await need(game);
      const prefab: GamePrefab = prefabFromObjects(name, dimension, objects, description);
      return unwrapLevel(await deps.service.levels.prefabs.set(found.gameId, prefab));
    },

    async game_level_scatter({ game, scene, area, options, layer, snap, label, save, select }) {
      const found = await need(game);
      const read = unwrapLevel(await readLevelForTool(deps.service, found.gameId, scene));
      const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
      const { ops, points, capped } = scatterOps({ level: read.level, area, options: { ...options, seed }, layer, snap, instanceId: () => crypto.randomUUID().slice(0, 8) });
      if (ops.length === 0) {
        throw new McpToolError('error', points === 0 ? 'Nothing to scatter: the area is already as dense as `density` asks, or too small for `spacing`.' : 'Nothing to scatter.');
      }
      const written = await writeEntityOps({ game: found.gameId, scene, unit: 'px', label: label ?? `Scatter ${ops.length} objects`, save, select }, ops);
      return { ...written, points, capped };
    },

    async game_terrain_height({ game, scene, points, normals }) {
      const found = await need(game);
      const read = unwrapLevel(await readLevelForTool(deps.service, found.gameId, scene));
      const got = await readLevelGround(found.path, (read.level && typeof read.level === 'object' ? read.level : {}) as Pick<GameLevel, 'properties'>);
      if (!got.ok) throw new McpToolError('error', got.message);
      return groundHeights(got.ground, points, normals);
    },

    async game_state({ game }) {
      const found = await need(game);
      const state = await readState(running(found.gameId));
      return { state: state as McpToolOutput<'game_state'>['state'] };
    },
  };
}
