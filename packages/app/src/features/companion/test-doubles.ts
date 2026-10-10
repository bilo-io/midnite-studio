import {
  checkCompanionGuard,
  companionSettingReadBack,
  companionSettingSpec,
  companionSettingTier,
  emptyCompanionSnapshot,
  transition,
  type CompanionDigest,
  type CompanionEvent,
  type CompanionPhraseKind,
  type CompanionProfile,
  type CompanionSettingKey,
  type CompanionSnapshot,
  type CompanionState,
  type CompanionTurn,
  type CompanionVocabulary,
  type RepoDescriptor,
} from '@midnite/studio-shared';

import type { ConciergeDeps, ConciergeStore } from './concierge';
import type { CompanionSettingsPort, HandoffDeps } from './handoff';
import { silentSpeaker, type Speaker } from './ports';
import type { CompanionSettingChange, CompanionSettingResult } from './settings-apply';
import type { CompanionProfilesPort } from './profile-handoff';
import type { CompanionProfileResult } from './profiles';

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
  passingChecks: 0,
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
    // The default fake never actually waits — a test that wants to assert on
    // the pause itself passes its own spy (see `concierge.test.ts`'s
    // "pauses between paragraphs" case).
    sleep: async () => {},
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
    companionSettings: fakeCompanionSettings(),
    persona: async () => ({ ok: true, value: { text: 'Keep it short.', summary: 'Short answers.' } }),
    hasAgentCli: () => true,
    ...over,
  };
}

/**
 * The settings port over a plain record: `preview` mirrors the setter's tier
 * rule (a `confirm` key needs `confirmed`, a `never` key is refused), and
 * `applyAndAnnounce` writes, then speaks the spec's own read-back. Enough for
 * `act()`'s per-tier flow; `settings-announce.test.ts` covers the real
 * ordering and the toast.
 */
export function fakeCompanionSettings(
  values: Partial<Record<CompanionSettingKey, unknown>> = {},
  over: Partial<CompanionSettingsPort> = {},
): CompanionSettingsPort & { values: Partial<Record<CompanionSettingKey, unknown>>; applied: CompanionSettingChange[] } {
  const state = { ...values };
  const applied: CompanionSettingChange[] = [];
  const preview = (change: CompanionSettingChange): CompanionSettingResult => {
    const tier = companionSettingTier(change.key, change.value);
    if (tier === 'never') return { ok: false, key: change.key, reason: 'never', message: 'Never.' };
    if (tier === 'confirm' && change.confirmed !== true) {
      return { ok: false, key: change.key, reason: 'confirm', message: 'That one needs a yes first.' };
    }
    const guard = checkCompanionGuard(companionSettingSpec(change.key), state[change.key], change.value, {
      source: 'voice',
    });
    if (!guard.ok) return { ok: false, key: change.key, reason: 'guard', message: guard.reason };
    return { ok: true, key: change.key, previous: state[change.key], next: change.value, tier };
  };
  return {
    values: state,
    applied,
    read: (key) => state[key],
    preview,
    applyAndAnnounce: async (change, speak) => {
      const result = preview(change);
      if (!result.ok) return result;
      state[change.key] = change.value;
      applied.push(change);
      await speak(companionSettingReadBack(change.key, change.value));
      return result;
    },
    undoAndAnnounce: async (speak) => {
      await speak('Nothing to undo.');
      return { ok: false, reason: 'nothing' };
    },
    systemVoices: () => [],
    profiles: fakeCompanionProfiles(),
    ...over,
  };
}

/**
 * The profiles port over a plain array (Phase 109 Theme G): names match
 * case-insensitively, a save over a taken name needs `overwrite`, a switch
 * records the name and speaks one line, and `changed` is false for the
 * profile already active. `profiles.test.ts` covers the real store writes.
 */
export function fakeCompanionProfiles(
  initial: readonly CompanionProfile[] = [],
  activeId: string | null = null,
): CompanionProfilesPort & { profiles: CompanionProfile[]; switched: string[]; active: () => string | null } {
  const profiles = [...initial];
  let active = activeId;
  const switched: string[] = [];
  const find = (name: string) =>
    profiles.find((profile) => profile.name.toLowerCase() === name.trim().toLowerCase() || profile.id === name) ?? null;
  const notFound = (name: string): CompanionProfileResult => ({
    ok: false,
    reason: 'notFound',
    message: `I don't have a profile called ${name}.`,
  });
  return {
    profiles,
    switched,
    active: () => active,
    state: () => {
      const current = profiles.find((profile) => profile.id === active) ?? null;
      return { profiles, activeId: current?.id ?? null, active: current, modified: false };
    },
    previewSave: (name) => ({ ok: true, name, existing: find(name) }),
    save: (name, overwrite) => {
      const existing = find(name);
      if (existing && !overwrite) {
        return { ok: false, reason: 'confirm', message: 'Save over it?', profile: existing };
      }
      const profile: CompanionProfile = existing ?? {
        id: `p-${profiles.length + 1}`,
        name,
        voices: { local: null, system: null },
        personality: '',
        honorifics: [],
        createdAt: '2026-10-10T09:00:00.000Z',
      };
      if (!existing) profiles.push(profile);
      active = profile.id;
      return { ok: true, op: 'save', profile, overwritten: existing !== null };
    },
    switchAndAnnounce: async (name, speak) => {
      const profile = find(name);
      if (!profile) return notFound(name);
      const changed = active !== profile.id;
      active = profile.id;
      switched.push(profile.name);
      if (changed) await speak(`This is ${profile.name} now.`);
      return { ok: true, op: 'switch', profile, changed, results: [] };
    },
    previewDelete: (name) => {
      const profile = find(name);
      return profile ? { ok: true, profile } : { ok: false, reason: 'notFound', message: `I don't have a profile called ${name}.` };
    },
    delete: (name) => {
      const profile = find(name);
      if (!profile) return notFound(name);
      profiles.splice(profiles.indexOf(profile), 1);
      const wasActive = active === profile.id;
      if (wasActive) active = null;
      return { ok: true, op: 'delete', profile, wasActive };
    },
  };
}
