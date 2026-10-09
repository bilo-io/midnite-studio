import type { BrowserWindow } from 'electron';

import { EVENT_CHANNELS, ok, type GamePoppedResponse, type GitOpResult } from '@midnite/studio-shared';

import type { Logger } from '../log';
import type { GameRunner } from './game-runner';

export type GamePopoutDeps = {
  runner: Pick<GameRunner, 'reparent' | 'runState'>;
  /** Create (or focus) the `game` role window — `createRoleWindow('game', log)`. */
  openWindow: () => BrowserWindow;
  /** Push an event to every window. */
  send: (channel: string, payload: unknown) => void;
  log: Logger;
};

export type GamePopout = {
  popOut(gameId: string): GitOpResult;
  /** Move the popped game back into the main window, hidden. A no-op when nothing is popped out. */
  dock(): void;
  popped(): GamePoppedResponse;
};

/**
 * Pop out (Phase 107 Theme B): a game's sandboxed view moves into the `game`
 * popout window and back.
 *
 * There is one `game` window role, so one popped-out game: popping a second
 * docks the first, then moves the second into the same window. The window's
 * own `close` — its traffic light, or the Dock button (`window.dock`, which
 * closes it) — docks the view back into the main window *before* the window
 * and its child views are torn down, the same rule the browser and the apps
 * follow. Docked views come back hidden: the Games tab's host decides whether
 * it is on screen and pushes its bounds once it hears `gamesPopState`.
 */
export function createGamePopout(deps: GamePopoutDeps): GamePopout {
  let popped: string | null = null;
  const bound = new WeakSet<BrowserWindow>();

  const announce = (): void => deps.send(EVENT_CHANNELS.gamesPopState, { gameId: popped });

  const release = (): string | null => {
    if (popped === null) return null;
    const gameId = popped;
    popped = null;
    deps.runner.reparent(gameId, null, { visible: false });
    return gameId;
  };

  return {
    popOut(gameId) {
      const win = deps.openWindow();
      if (!bound.has(win)) {
        bound.add(win);
        win.on('close', () => {
          const docked = release();
          if (docked !== null) {
            deps.log.info(`game ${docked} docked (popout closed)`);
            announce();
          }
        });
      }
      if (popped !== gameId) {
        const previous = release();
        if (previous !== null) deps.log.info(`game ${previous} docked (replaced by ${gameId})`);
        popped = gameId;
        deps.runner.reparent(gameId, win, { visible: true });
        deps.log.info(`game ${gameId} popped out`);
      }
      announce();
      return ok();
    },

    dock() {
      if (release() !== null) announce();
    },

    popped: () => ({ gameId: popped, run: popped === null ? null : deps.runner.runState(popped) }),
  };
}
