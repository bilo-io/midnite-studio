import {
  EVENT_CHANNELS,
  gameEngineWarnings,
  MCP_CONTENT_KEY,
  type GameImportAssetRequest,
  type GameImportAssetResult,
  type GameInputEvent,
  type GameLogLevel,
  type GameSummary,
  type McpContentBlock,
  type McpToolInput,
  type McpToolOutput,
} from '@midnite/studio-shared';
import type { WebContents } from 'electron';

import { McpToolError } from '../mcp/errors';
import { clipError, readGameState } from './game-state';
import type { GameService } from './game-service';
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

/** The slice of Electron's `WebContents` the tools use — a fake in tests. */
export type GameWebContents = {
  capturePage(): Promise<GameImage>;
  sendInputEvent(event: Parameters<WebContents['sendInputEvent']>[0]): void;
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
  focus(): void;
};
export type GameImage = {
  getSize(): { width: number; height: number };
  resize(opts: { width: number; height: number }): GameImage;
  toPNG(): Buffer;
};

export type GameMcpDeps = {
  service: Pick<GameService, 'resolve' | 'list' | 'create' | 'manifestGet' | 'manifestSet' | 'run' | 'stop' | 'reload' | 'logs' | 'emit' | 'isRunning'>;
  /** The running game's web contents, or `null` when it is not running. */
  webContents: (gameId: string) => GameWebContents | null;
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
    | 'game_playtest']: (input: McpToolInput<K>) => Promise<McpToolOutput<K>>;
};

export { GAME_STATE_TIMEOUT_MS } from './game-state';
/** After the last input event the call waits this long, so the game can react before the next screenshot. */
export const GAME_INPUT_SETTLE_MS = 100;
/** A screenshot burst stops adding frames once its base64 passes this (the response cap is 4 MB). */
export const GAME_SCREENSHOT_BYTES_MAX = 3 * 1024 * 1024;
const NOT_RUNNING = 'Run the game first.';
const NOT_A_GAME_PATH = 'That folder is not a Midnite game.';
const NO_GAMEPAD_HOOK = 'This game has no gamepad hook (window.__midnite.input.gamepad), so gamepad events cannot be sent.';

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const clip = clipError;

/** Electron's `keyCode` for a DOM `key` value: only the space bar differs between the two vocabularies. */
export function toElectronKeyCode(key: string): string {
  return key === ' ' ? 'Space' : key;
}

/** One game input event as the `sendInputEvent` call it becomes; `null` for a gamepad event (delivered through the kit). */
export function toInputEvent(event: GameInputEvent): Parameters<WebContents['sendInputEvent']>[0] | null {
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

  function running(gameId: string): GameWebContents {
    const wc = deps.webContents(gameId);
    if (!wc) throw new McpToolError('error', NOT_RUNNING);
    return wc;
  }

  const unwrap = <T>(result: { ok: true; value: T } | { ok: true } | { ok: false; kind: string; message?: string }): T => {
    if (!result.ok) throw new McpToolError('error', 'message' in result && result.message ? result.message : 'That did not work.');
    return ('value' in result ? result.value : undefined) as T;
  };

  const playtests = (): Playtests => {
    if (!deps.playtests) throw new McpToolError('error', 'Play-tests are not ready yet.');
    return deps.playtests;
  };

  const readState = (wc: GameWebContents): Promise<unknown> => readGameState((code) => wc.executeJavaScript(code, false));

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

    async game_state({ game }) {
      const found = await need(game);
      const state = await readState(running(found.gameId));
      return { state: state as McpToolOutput<'game_state'>['state'] };
    },
  };
}
