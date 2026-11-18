import { randomUUID } from 'node:crypto';

import {
  EVENT_CHANNELS,
  failure,
  ok,
  type LevelEditorFailure,
  type GitOpResult,
  type LevelEditorOpenPayload,
  type LevelEditorRequest,
  type LevelEditorResult,
} from '@midnite/studio-shared';

/**
 * The main -> renderer level-editor bridge (Phase 138 Theme C). A request is pushed to the window as
 * `{ id, request }` on `EVENT_CHANNELS.gamesLevelEditorRequest`; the open Level editor answers one-way with
 * `{ id, result }`, which {@link LevelEditorBridge.resolve} matches to the waiting caller. The pattern is
 * Companion's `ui-bridge.ts` (a uuid-keyed pending map, one timer per request, a `failure()` envelope), written
 * here because a feature never imports another feature.
 *
 * Presence keeps a closed editor from costing a timeout: the renderer reports which scene it shows
 * ({@link LevelEditorBridge.setOpen}); a request for any other scene answers `not-open` at once, with no send.
 * `request` never rejects.
 */

export const LEVEL_EDITOR_TIMEOUT_MS = 5_000;
export const LEVEL_EDITOR_VIEW_TIMEOUT_MS = 15_000;
export const LEVEL_EDITOR_TIMEOUT_MESSAGE = 'the level editor did not answer';

export type LevelEditorBridge = {
  /** Resolves with the renderer's result, `not-open` for a scene the editor does not show, or a failure on timeout. Never rejects. */
  request(req: LevelEditorRequest, opts?: { timeoutMs?: number }): Promise<GitOpResult<LevelEditorResult>>;
  /** The renderer's answer. An unknown or already-answered id is dropped. */
  resolve(id: string, result: LevelEditorResult | LevelEditorFailure): void;
  /** The scene the editor shows now, or `null`. */
  setOpen(open: LevelEditorOpenPayload): void;
  open(): LevelEditorOpenPayload;
};

type Pending = { resolve: (result: GitOpResult<LevelEditorResult>) => void; timer: ReturnType<typeof setTimeout> };

export function createLevelEditorBridge(deps: { send: (channel: string, payload: unknown) => void }): LevelEditorBridge {
  const pending = new Map<string, Pending>();
  let open: LevelEditorOpenPayload = null;

  return {
    request(req, opts = {}) {
      if (!open || open.gameId !== req.gameId || open.scene !== req.scene) {
        return Promise.resolve(ok<LevelEditorResult>({ handled: false, reason: 'not-open' }));
      }
      return new Promise<GitOpResult<LevelEditorResult>>((resolve) => {
        const id = randomUUID();
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve(failure(LEVEL_EDITOR_TIMEOUT_MESSAGE));
        }, opts.timeoutMs ?? LEVEL_EDITOR_TIMEOUT_MS);
        pending.set(id, { resolve, timer });
        try {
          deps.send(EVENT_CHANNELS.gamesLevelEditorRequest, { id, request: req });
        } catch {
          clearTimeout(timer);
          pending.delete(id);
          resolve(failure(LEVEL_EDITOR_TIMEOUT_MESSAGE));
        }
      });
    },
    resolve(id, result) {
      const entry = pending.get(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(id);
      entry.resolve('handled' in result ? ok<LevelEditorResult>(result) : result);
    },
    setOpen(next) {
      open = next;
    },
    open: () => open,
  };
}
