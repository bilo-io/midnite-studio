import {
  COMPANION_TRANSCRIPT_CAP,
  transition,
  type CompanionEvent,
  type CompanionPhraseKind,
  type CompanionState,
  type CompanionTurn,
} from '@midnite/studio-shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { adoptRenamedPersistKey } from './persist-rename';

/**
 * The companion's runtime state (Phase 79 Theme A).
 *
 * Deliberately **not** in `ui-store.ts`. The five *settings* do live there
 * beside every other preference (and are covered by Phase 63's orphan-key
 * partition); what lives here is the volatile half — a state machine value, a
 * capped transcript, the picker's no-repeat memory, and which agent session a
 * hand-off is waiting on. Only the transcript persists.
 *
 * `state` is advanced exclusively through `send`, which delegates to `shared`'s
 * total `transition` table. There is no setter that assigns a state directly,
 * and that is the point: an illegal event is a no-op rather than a throw, so
 * no caller needs a try/catch and no late timer can put the machine somewhere
 * the table does not allow.
 */

/** Which agent session a live hand-off is waiting on, and what it was asked. */
export type CompanionHandoff = {
  /** The terminal session id the companion started — Theme E resolves it through the skill hand-off. */
  sessionId: string;
  /** The command string typed into that session, for the "the last one is still running" reply. */
  command: string;
};

export type CompanionStoreState = {
  state: CompanionState;
  /** Newest LAST, exactly as a chat thread renders. Capped at {@link COMPANION_TRANSCRIPT_CAP}. */
  transcript: CompanionTurn[];
  /**
   * The picker's memory, newest FIRST and per bank — `pickPhrase` slices a
   * prefix off it, so the order is load-bearing rather than incidental.
   *
   * Not persisted: a fresh launch repeating one greeting is invisible, and a
   * persisted window would be a rehydrated set of strings from a build whose
   * phrase banks may have changed under it.
   */
  recentPhrases: Partial<Record<CompanionPhraseKind, string[]>>;
  activeHandoff: CompanionHandoff | null;

  /** Advance the machine. Returns the state it settled in, which may be the one it was already in. */
  send: (event: CompanionEvent) => CompanionState;
  /** Append a turn, trimming the oldest past the cap. Returns the turn as stored. */
  addTurn: (
    turn: Omit<CompanionTurn, 'id' | 'at'> & Partial<Pick<CompanionTurn, 'id' | 'at'>>,
  ) => CompanionTurn;
  /** Mark a turn as having actually been read aloud (Theme F). */
  markSpoken: (id: string) => void;
  /** Record a pick so the next one in that bank avoids it. */
  notePhrase: (kind: CompanionPhraseKind, phrase: string) => void;
  /** Start tracking a hand-off. Does not itself advance the machine — Theme E sends `handoff` too. */
  setActiveHandoff: (handoff: CompanionHandoff | null) => void;
  clearTranscript: () => void;
};

/** The slice that reaches `localStorage` — named so `partialize` and any future `migrate` cannot drift. */
export type PersistedCompanion = Pick<CompanionStoreState, 'transcript'>;

/**
 * How many picks per bank the window remembers.
 *
 * `noRepeatWindow` never looks past three, so keeping four is one spare — and
 * an unbounded list would grow for the life of a session for no benefit.
 */
const RECENT_PHRASES_CAP = 4;

/**
 * Pre-rename state, adopted before the store hydrates — see
 * `persist-rename.ts` for why this cannot be a zustand `migrate`.
 */
adoptRenamedPersistKey('midnite-studio.companion', 'midnite-studio.companion');

/** Ids only have to be unique within one transcript; `crypto.randomUUID` is available in both Electron and jsdom. */
const turnId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `turn-${Math.random().toString(36).slice(2)}-${Date.now()}`;

export const useCompanionStore = create<CompanionStoreState>()(
  persist(
    (set, get) => ({
      /*
        `off`, not `idle`, is the initial state — `companionEnabled` defaults to
        false, and the machine has to agree with the switch before anything
        renders. Theme C's panel sends `enable` when the setting turns on.
      */
      state: 'off',
      transcript: [],
      recentPhrases: {},
      activeHandoff: null,

      send: (event) => {
        const next = transition(get().state, event);
        // Assign only on a real change: zustand notifies every subscriber on
        // `set`, and the no-op events are the frequent ones (a `pty:activity`
        // ping arriving while the companion is idle, say).
        if (next !== get().state) set({ state: next });
        return next;
      },

      addTurn: (turn) => {
        const stored: CompanionTurn = {
          id: turn.id ?? turnId(),
          at: turn.at ?? Date.now(),
          role: turn.role,
          text: turn.text,
          spoken: turn.spoken,
        };
        set((current) => ({
          transcript: [...current.transcript, stored].slice(-COMPANION_TRANSCRIPT_CAP),
        }));
        return stored;
      },

      markSpoken: (id) =>
        set((current) => {
          const index = current.transcript.findIndex((turn) => turn.id === id);
          if (index === -1 || current.transcript[index]?.spoken === true) return current;
          const transcript = [...current.transcript];
          transcript[index] = { ...(transcript[index] as CompanionTurn), spoken: true };
          return { transcript };
        }),

      notePhrase: (kind, phrase) =>
        set((current) => ({
          recentPhrases: {
            ...current.recentPhrases,
            [kind]: [phrase, ...(current.recentPhrases[kind] ?? [])].slice(0, RECENT_PHRASES_CAP),
          },
        })),

      setActiveHandoff: (activeHandoff) => set({ activeHandoff }),

      clearTranscript: () => set({ transcript: [] }),
    }),
    {
      name: 'midnite-studio.companion',
      version: 1,
      /*
        The transcript and nothing else. `state` is a live machine value that a
        reload has no business restoring (a persisted `handoff` would wait
        forever on a pty that died with the window); `activeHandoff` names a
        session id that may not exist next launch; `recentPhrases` is a picker
        detail worth nothing across launches.

        No `migrate`, matching `dashboard-store.ts`: version 1 is the first
        shape this key has ever had, and a `migrate` with no version to migrate
        from is a hook that can only be wrong later.
      */
      partialize: (state): PersistedCompanion => ({
        transcript: state.transcript.slice(-COMPANION_TRANSCRIPT_CAP),
      }),
    },
  ),
);
