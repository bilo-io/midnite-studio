import {
  emptyCompanionSnapshot,
  transition,
  type CompanionDigest,
  type CompanionEvent,
  type CompanionPhraseKind,
  type CompanionSnapshot,
  type CompanionState,
  type CompanionTurn,
  type CompanionVocabulary,
  type RepoDescriptor,
} from '@midnite/studio-shared';

import type { ConciergeDeps, ConciergeStore } from './concierge';
import type { HandoffDeps } from './handoff';
import { silentSpeaker, type Speaker } from './ports';

/**
 * Fakes for the companion flow's ports — Phase 79 Themes D and E.
 *
 * A module rather than a per-file helper because `concierge.test.ts` and
 * `handoff.test.ts` need the identical store double: the two files test one
 * conversation from opposite ends, and a second copy of `fakeStore` would let
 * them disagree about what a transcript looks like.
 *
 * The store double is not a mock. It runs `shared`'s real `transition` table
 * and keeps a real transcript array, so a test that asserts turn order is
 * asserting against the same state machine the app runs — the only thing
 * missing is zustand.
 */

export type FakeStore = ConciergeStore & {
  /** Every turn, in order, as `role: text` — the shape most assertions want. */
  lines: () => string[];
  /** The events that reached the machine, including the ones it refused. */
  events: CompanionEvent[];
};

export function fakeStore(initial: CompanionState = 'idle'): FakeStore {
  let id = 0;
  const store: FakeStore = {
    state: initial,
    transcript: [] as CompanionTurn[],
    recentPhrases: {} as Partial<Record<CompanionPhraseKind, string[]>>,
    events: [],
    send: (event) => {
      store.events.push(event);
      store.state = transition(store.state, event);
      return store.state;
    },
    addTurn: (turn) => {
      id += 1;
      const stored: CompanionTurn = {
        id: `t${id}`,
        at: 1_700_000_000_000 + id,
        role: turn.role,
        text: turn.text,
        spoken: turn.spoken,
      };
      (store.transcript as CompanionTurn[]).push(stored);
      return stored;
    },
    markSpoken: (turnId) => {
      const found = (store.transcript as CompanionTurn[]).find((turn) => turn.id === turnId);
      if (found) found.spoken = true;
    },
    notePhrase: (kind, value) => {
      store.recentPhrases[kind] = [value, ...(store.recentPhrases[kind] ?? [])].slice(0, 4);
    },
    lines: () => store.transcript.map((turn) => `${turn.role}: ${turn.text}`),
  };
  return store;
}

/** A speaker that records what it was asked to say and claims to be real. */
export function fakeSpeaker(): Speaker & { spoken: string[]; cancelled: number } {
  const speaker = {
    spoken: [] as string[],
    cancelled: 0,
    available: true,
    speak: async (text: string) => {
      speaker.spoken.push(text);
    },
    cancel: () => {
      speaker.cancelled += 1;
    },
  };
  return speaker;
}

export const repoFixture = (over: Partial<RepoDescriptor> = {}): RepoDescriptor => ({
  id: 'r1',
  path: '/repos/studio',
  name: 'midnite-studio',
  headRef: 'main',
  worktrees: [],
  ...over,
});

export const snapshotFixture = (over: Partial<CompanionSnapshot> = {}): CompanionSnapshot => ({
  ...emptyCompanionSnapshot(1),
  repo: repoFixture(),
  branch: 'main',
  openPulls: 0,
  failingChecks: 0,
  ...over,
});

export const digestFixture = (over: Partial<CompanionDigest> = {}): CompanionDigest => ({
  landed: [{ kind: 'pr', title: 'the browser occlusion fix', ref: '#265', at: 1 }],
  inProgress: [],
  since: 1_699_000_000_000,
  ...over,
});

/** Empty by default — a test that exercises `navigate`/`run` fills in what it needs. */
export const vocabularyFixture = (over: Partial<CompanionVocabulary> = {}): CompanionVocabulary => ({
  views: [],
  settingsPages: [],
  commands: [],
  skills: [],
  repos: [],
  ...over,
});

/**
 * Deps wired to fakes, with an un-aborted signal.
 *
 * `rng` is pinned so phrase picks are deterministic: the flow's *shape* is
 * what these tests assert, and a random greeting would make every assertion
 * on the first line a substring match.
 */
export function fakeConciergeDeps(over: Partial<ConciergeDeps> = {}): ConciergeDeps {
  return {
    store: fakeStore(),
    // The silent stand-in by default, because voice off is this feature's
    // default configuration — a test that wants to assert on speech says so.
    speaker: silentSpeaker,
    snapshot: async () => snapshotFixture(),
    digest: async () => digestFixture(),
    settings: () => ({ honorifics: [], handsFree: false, voiceInReady: false }),
    repo: () => ({ path: '/repos/studio', name: 'midnite-studio' }),
    signal: new AbortController().signal,
    rng: () => 0,
    now: () => 1_699_600_000_000,
    ...over,
  };
}

export function fakeHandoffDeps(over: Partial<HandoffDeps> = {}): HandoffDeps {
  return {
    ...fakeConciergeDeps(),
    startSkill: () => ({ id: 'session-1' }),
    startVerbatim: () => ({ id: 'session-verbatim' }),
    ask: async () => ({ ok: true, value: { say: 'Routed.' } }),
    scrollback: async () => null,
    markers: () => undefined,
    repos: async () => [repoFixture()],
    selectRepo: () => {},
    autoSendAllowed: () => false,
    activeHandoff: () => null,
    setActiveHandoff: () => {},
    pendingAction: () => null,
    setPendingAction: () => {},
    vocabulary: () => vocabularyFixture(),
    navigate: async () => ({ say: 'Here.' }),
    ...over,
  };
}
