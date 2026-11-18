import {
  EVENT_CHANNELS,
  failure,
  GAME_ENTITIES_MAX,
  GAME_ENTITY_POLL_MS,
  GameEntitySnapshotSchema,
  ok,
  type GameEntitiesResult,
  type GameEntitySnapshot,
  type GameRunStatePayload,
  type GitOpResult,
} from '@midnite/studio-shared';

import { clipError, evalWithTimeout } from './game-state';

/**
 * Live entities (Phase 140 Theme D): the running game's `window.__midnite.entities()` read once, and the 4 Hz
 * poller that pushes it to the editor while it watches. The page's answer is untrusted data: capped, parsed
 * as JSON and validated entry by entry, never evaluated.
 */

export const GAME_ENTITIES_TIMEOUT_MS = 1000;
/** A hostile `entities()` that answers with more than this many characters is refused. */
export const GAME_ENTITIES_MAX_BYTES = 512 * 1024;

/** One evaluation: the scene and frame from `getState()` beside `entities()`; `null` when there is no hook at all. */
export const GET_ENTITIES_JS =
  '(() => { try { const h = window.__midnite; if (!h) return null; if (typeof h.entities !== "function") return JSON.stringify({ unsupported: true }); ' +
  'const s = (typeof h.getState === "function" ? h.getState() : null) || {}; ' +
  'return JSON.stringify({ scene: s.scene, frame: s.frame, entities: h.entities() }); } catch (e) { return JSON.stringify({ __error: String(e) }); } })()';

const EMPTY: GameEntitiesResult = { scene: '', frame: 0, entities: [], truncated: false };

/** Read a game's entities. A pre-0.13 kit answers `{ entities: [], unsupported: true }`; failures are the result envelope. */
export async function readGameEntities(evaluate: (code: string) => Promise<unknown>): Promise<GitOpResult<GameEntitiesResult>> {
  let raw: unknown;
  try {
    raw = await evalWithTimeout(evaluate, GET_ENTITIES_JS, GAME_ENTITIES_TIMEOUT_MS, 'entities()');
  } catch (error) {
    return failure(error instanceof Error ? clipError(error.message) : 'Could not reach the game.');
  }
  if (raw === null) return ok({ ...EMPTY, unsupported: true });
  if (typeof raw !== 'string') return failure('entities() did not return JSON.');
  if (raw.length > GAME_ENTITIES_MAX_BYTES) return failure('entities() returned more than 512 KB.');
  let parsed: { unsupported?: unknown; __error?: unknown; scene?: unknown; frame?: unknown; entities?: unknown };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    return failure('entities() did not return valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null) return failure('entities() must return an array.');
  if (typeof parsed.__error === 'string') return failure(clipError(`entities() threw: ${parsed.__error}`));
  if (parsed.unsupported === true) return ok({ ...EMPTY, unsupported: true });
  if (!Array.isArray(parsed.entities)) return failure('entities() must return an array.');
  const entities: GameEntitySnapshot[] = [];
  for (const entry of parsed.entities.slice(0, GAME_ENTITIES_MAX)) {
    const valid = GameEntitySnapshotSchema.safeParse(entry);
    if (valid.success) entities.push(valid.data);
  }
  return ok({
    scene: typeof parsed.scene === 'string' ? parsed.scene : '',
    frame: typeof parsed.frame === 'number' && Number.isInteger(parsed.frame) ? parsed.frame : 0,
    entities,
    truncated: parsed.entities.length > GAME_ENTITIES_MAX,
  });
}

export type EntityPollerDeps = {
  /** One read of the game's entities. */
  read: (gameId: string) => Promise<GitOpResult<GameEntitiesResult>>;
  /** The run's lifecycle state, or `null` when the game is not running. */
  runState: (gameId: string) => GameRunStatePayload | null;
  send: (channel: string, payload: unknown) => void;
  intervalMs?: number;
};

export type EntityPoller = {
  /** Subscribe (`on: true`) or unsubscribe a watcher; the poller runs while a game has at least one. */
  watch(gameId: string, watcherId: string, on: boolean): void;
  stopAll(): void;
};

/**
 * Emits one `gamesEntityState` per tick for each watched game that is running and not paused (a paused game's
 * last snapshot stays on screen). A read still in flight skips the tick instead of queueing a second one, so a
 * slow game is polled slower, never harder. The timer for a game ends with its last watcher, or as soon as
 * a tick finds the game stopped (a later run needs a fresh `watch`).
 */
export function createEntityPoller(deps: EntityPollerDeps): EntityPoller {
  const interval = deps.intervalMs ?? GAME_ENTITY_POLL_MS;
  const games = new Map<string, { watchers: Set<string>; timer: ReturnType<typeof setInterval>; busy: boolean }>();

  const end = (gameId: string): void => {
    const entry = games.get(gameId);
    if (!entry) return;
    clearInterval(entry.timer);
    games.delete(gameId);
  };

  const tick = async (gameId: string): Promise<void> => {
    const entry = games.get(gameId);
    if (!entry || entry.busy) return;
    const state = deps.runState(gameId);
    if (state === null || state.state === 'stopped' || state.state === 'crashed') {
      end(gameId);
      return;
    }
    if (state.state !== 'running') return;
    entry.busy = true;
    try {
      const result = await deps.read(gameId);
      if (result.ok && games.get(gameId) === entry) deps.send(EVENT_CHANNELS.gamesEntityState, { gameId, result: result.value });
    } finally {
      entry.busy = false;
    }
  };

  return {
    watch(gameId, watcherId, on) {
      const entry = games.get(gameId);
      if (!on) {
        if (!entry) return;
        entry.watchers.delete(watcherId);
        if (entry.watchers.size === 0) end(gameId);
        return;
      }
      if (entry) {
        entry.watchers.add(watcherId);
        return;
      }
      const created = { watchers: new Set([watcherId]), busy: false, timer: setInterval(() => void tick(gameId), interval) };
      games.set(gameId, created);
    },
    stopAll() {
      for (const gameId of [...games.keys()]) end(gameId);
    },
  };
}
