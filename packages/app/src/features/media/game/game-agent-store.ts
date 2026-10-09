import {
  GAME_PASSES_DEFAULT,
  type GameAgentCommit,
  type GameAgentProgress,
} from '@midnite/studio-shared';
import { useEffect } from 'react';
import { create } from 'zustand';

import { bridge } from '../../../services/bridge';

/**
 * The Games tab's view of agent runs (Phase 107 Theme M): one edit thread per
 * game, fed by `gamesAgentProgress`, and the engine/passes the user last
 * picked. Not persisted — the history that matters is the game's own commits,
 * which the Timeline shows; this is the conversation around them.
 */
export type GameThreadEntry =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'action'; text: string }
  | {
      id: string;
      kind: 'commit';
      runId: string;
      pass: number;
      of: number;
      commit: GameAgentCommit;
      undone?: boolean;
      /** Folded into the run's one squashed commit (Settings ▸ Media ▸ Games). */
      squashed?: boolean;
    }
  | { id: string; kind: 'result'; text: string }
  | { id: string; kind: 'error'; text: string };

export type GameAgentRun = { runId: string; pass: number; of: number };

/** `agent:<agentId>` or `ollama:<model>`. */
export type GameEngineChoice = string;

type State = {
  threads: Record<string, GameThreadEntry[]>;
  runs: Record<string, GameAgentRun>;
  engine: GameEngineChoice | null;
  passes: number;
  /** The Ollama warning banner, dismissed for this session. */
  ollamaWarningDismissed: boolean;
  setEngine: (engine: GameEngineChoice) => void;
  setPasses: (passes: number) => void;
  dismissOllamaWarning: () => void;
  started: (gameId: string, prompt: string, runId: string, of: number) => void;
  failedToStart: (gameId: string, prompt: string, message: string) => void;
  applyProgress: (event: GameAgentProgress) => void;
  undone: (gameId: string, sha: string) => void;
  note: (gameId: string, kind: 'result' | 'error', text: string) => void;
};

let seq = 0;
const nextId = (): string => `t${++seq}`;
const append = (
  threads: State['threads'],
  gameId: string,
  entry: GameThreadEntry,
): State['threads'] => ({
  ...threads,
  [gameId]: [...(threads[gameId] ?? []), entry],
});

export const useGameAgentStore = create<State>((set) => ({
  threads: {},
  runs: {},
  engine: null,
  passes: GAME_PASSES_DEFAULT,
  ollamaWarningDismissed: false,
  setEngine: (engine) => set({ engine }),
  setPasses: (passes) => set({ passes }),
  dismissOllamaWarning: () => set({ ollamaWarningDismissed: true }),
  started: (gameId, prompt, runId, of) =>
    set((s) => ({
      threads: append(s.threads, gameId, { id: nextId(), kind: 'user', text: prompt }),
      runs: { ...s.runs, [gameId]: { runId, pass: 0, of } },
    })),
  failedToStart: (gameId, prompt, message) =>
    set((s) => ({
      threads: append(
        append(s.threads, gameId, { id: nextId(), kind: 'user', text: prompt }),
        gameId,
        { id: nextId(), kind: 'error', text: message },
      ),
    })),
  applyProgress: (event) =>
    set((s) => {
      const { gameId } = event;
      let threads = s.threads;
      let runs = s.runs;
      if (event.finished) {
        // With squashing on, the per-pass commits were replaced by one: mark them and show it.
        const kept = new Set(event.finished.commits.map((c) => c.sha));
        const seen = new Set<string>();
        threads = {
          ...threads,
          [gameId]: (threads[gameId] ?? []).map((e) => {
            if (e.kind !== 'commit' || e.runId !== event.runId) return e;
            seen.add(e.commit.sha);
            return kept.has(e.commit.sha) ? e : { ...e, squashed: true };
          }),
        };
        for (const commit of event.finished.commits) {
          if (!seen.has(commit.sha)) {
            threads = append(threads, gameId, {
              id: nextId(),
              kind: 'commit',
              runId: event.runId,
              pass: event.of,
              of: event.of,
              commit,
            });
          }
        }
        threads = append(threads, gameId, {
          id: nextId(),
          kind: event.finished.outcome === 'done' ? 'result' : 'error',
          text:
            event.finished.outcome === 'cancelled'
              ? `Cancelled. ${committedNote(event.finished.commits.length)}`
              : event.finished.message,
        });
        const { [gameId]: _ended, ...rest } = runs;
        runs = rest;
      } else {
        if (event.commit) {
          threads = append(threads, gameId, {
            id: nextId(),
            kind: 'commit',
            runId: event.runId,
            pass: event.pass,
            of: event.of,
            commit: event.commit,
          });
        } else if (event.action) {
          threads = append(threads, gameId, { id: nextId(), kind: 'action', text: event.action });
        }
        const current = runs[gameId];
        if (current && current.runId === event.runId)
          runs = { ...runs, [gameId]: { ...current, pass: event.pass, of: event.of } };
      }
      return { threads, runs };
    }),
  undone: (gameId, sha) =>
    set((s) => ({
      threads: append(
        {
          ...s.threads,
          [gameId]: (s.threads[gameId] ?? []).map((e) =>
            e.kind === 'commit' && e.commit.sha === sha ? { ...e, undone: true } : e,
          ),
        },
        gameId,
        {
          id: nextId(),
          kind: 'result',
          text: `Undid ${sha.slice(0, 7)} with a new revert commit.`,
        },
      ),
    })),
  note: (gameId, kind, text) =>
    set((s) => ({ threads: append(s.threads, gameId, { id: nextId(), kind, text }) })),
}));

const committedNote = (n: number): string =>
  n === 0 ? 'Nothing was committed.' : `${n === 1 ? 'One commit' : `${n} commits`} kept.`;

/** The newest commit entry in a thread that can still be undone, if it is the thread's last commit. */
export function undoableCommit(entries: readonly GameThreadEntry[]): GameThreadEntry | null {
  const commits = entries.filter((e) => e.kind === 'commit' && !e.squashed);
  const last = commits.at(-1);
  return last && last.kind === 'commit' && !last.undone ? last : null;
}

/** Subscribes the tab to run progress; mount once, in `GameTab`. */
export function useGameAgentEvents(): void {
  useEffect(() => {
    const api = bridge();
    if (!api?.games.agent) return;
    return api.games.agent.onProgress((event) => useGameAgentStore.getState().applyProgress(event));
  }, []);
}
