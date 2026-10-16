import { create } from 'zustand';

/**
 * The pull queue panel's own state (Phase 96 Theme C), fed by
 * `bridge().ollama.onPullProgress` — a zustand store rather than React Query
 * cache, per the phase doc's own requirement ("state lives in a store fed by
 * the event stream") so the panel survives switching away from the Models
 * view and back, the same reasoning `tests-store.ts` gives for its own live
 * run state. Deliberately not persisted: a pull belongs to this session, and
 * a stale "pulling" row surviving a reload with no stream left to finish it
 * would be worse than losing it.
 */
export type PullEntry = {
  pullId: string;
  model: string;
  /** Ollama's own free-text progress label — `"pulling manifest"`,
   *  `"downloading sha256:…"`, `"verifying sha256 digest"`, `"success"`, an
   *  `"error: …"` line this store's own subscriber synthesises, or
   *  `"cancelled"`. Never a closed enum — see `OllamaPullProgressEvent`. */
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  done: boolean;
  /** Set once `status` starts with `"error: "` or equals `"cancelled"` — the
   *  panel's own reading of the terminal event, not a field Ollama sends. */
  failed: boolean;
  startedAt: number;
};

export type ModelsPullQueueState = {
  pulls: Record<string, PullEntry>;

  /** Optimistic entry the moment a pull is requested, before the first
   *  progress event arrives. */
  queued: (pullId: string, model: string) => void;
  progress: (event: {
    pullId: string;
    model: string;
    status: string;
    digest?: string;
    total?: number;
    completed?: number;
    done?: boolean;
  }) => void;
  /** Drops a finished (done) entry from the panel — kept visible until the
   *  user dismisses it or starts a new pull for the same slot. */
  dismiss: (pullId: string) => void;
  clearFinished: () => void;
};

function isFailedStatus(status: string): boolean {
  return status === 'cancelled' || status.startsWith('error: ');
}

export const useModelsPullQueueStore = create<ModelsPullQueueState>((set) => ({
  pulls: {},

  queued: (pullId, model) =>
    set((state) => ({
      pulls: {
        ...state.pulls,
        [pullId]: {
          pullId,
          model,
          status: 'queued',
          done: false,
          failed: false,
          startedAt: Date.now(),
        },
      },
    })),

  progress: (event) =>
    set((state) => {
      const existing = state.pulls[event.pullId];
      return {
        pulls: {
          ...state.pulls,
          [event.pullId]: {
            pullId: event.pullId,
            model: event.model,
            status: event.status,
            digest: event.digest,
            total: event.total,
            completed: event.completed,
            done: event.done ?? false,
            failed: isFailedStatus(event.status),
            startedAt: existing?.startedAt ?? Date.now(),
          },
        },
      };
    }),

  dismiss: (pullId) =>
    set((state) => {
      const next = { ...state.pulls };
      delete next[pullId];
      return { pulls: next };
    }),

  clearFinished: () =>
    set((state) => {
      const next: Record<string, PullEntry> = {};
      for (const [id, entry] of Object.entries(state.pulls)) {
        if (!entry.done) next[id] = entry;
      }
      return { pulls: next };
    }),
}));
