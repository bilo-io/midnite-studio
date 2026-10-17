import { GAME_LOG_CAPACITY, type GameLogEntry, type GameRunStatePayload } from '@midnite/studio-shared';
import { create } from 'zustand';

/**
 * What the Games tab knows about each running game (Phase 107 Theme B): the
 * latest run state and the console entries main has batched over. Not
 * persisted — a run is a live process, and main owns the buffer behind it
 * (`game_logs`'s cursor); this is only the drawer's view of it.
 */
export type GameRunInfo = Pick<GameRunStatePayload, 'runId' | 'state' | 'reason'>;

type State = {
  runs: Record<string, GameRunInfo>;
  logs: Record<string, GameLogEntry[]>;
  /** `seq` the user cleared the view at; entries at or below it are hidden. */
  clearedAt: Record<string, number>;
  /** The game the `game` popout window hosts (Theme B), or `null`. */
  popped: string | null;
  setPopped: (gameId: string | null) => void;
  applyRunState: (payload: GameRunStatePayload) => void;
  appendLogs: (gameId: string, runId: string, entries: GameLogEntry[]) => void;
  clear: (gameId: string) => void;
};

export const useGameRunStore = create<State>((set) => ({
  runs: {},
  logs: {},
  clearedAt: {},
  popped: null,
  setPopped: (gameId) => set({ popped: gameId }),
  applyRunState: ({ gameId, runId, state, reason }) =>
    set((current) => {
      // A new run starts a new console.
      const fresh = current.runs[gameId]?.runId !== runId;
      return {
        runs: { ...current.runs, [gameId]: { runId, state, ...(reason === undefined ? {} : { reason }) } },
        logs: fresh ? { ...current.logs, [gameId]: [] } : current.logs,
        clearedAt: fresh ? { ...current.clearedAt, [gameId]: 0 } : current.clearedAt,
      };
    }),
  appendLogs: (gameId, runId, entries) =>
    set((current) => {
      if (current.runs[gameId] && current.runs[gameId]!.runId !== runId) return current;
      const merged = [...(current.logs[gameId] ?? []), ...entries];
      return { logs: { ...current.logs, [gameId]: merged.slice(-GAME_LOG_CAPACITY) } };
    }),
  clear: (gameId) =>
    set((current) => {
      const last = current.logs[gameId]?.at(-1)?.seq ?? 0;
      return { clearedAt: { ...current.clearedAt, [gameId]: last } };
    }),
}));

/** Whether a state means a renderer process exists for the game. */
export const isLive = (state: GameRunInfo['state'] | undefined): boolean =>
  state === 'starting' || state === 'running' || state === 'paused';
