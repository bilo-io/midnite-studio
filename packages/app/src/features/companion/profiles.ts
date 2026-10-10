import {
  COMPANION_PROFILES_FULL_MESSAGE,
  COMPANION_PROFILES_MAX,
  CompanionProfileSchema,
  companionProfileFields,
  companionProfileNameProblem,
  findCompanionProfile,
  isCompanionProfileModified,
  type CompanionProfile,
  type CompanionSettingSource,
} from '@midnite/studio-shared';

import { useUiStore } from '../../store/ui-store';
import {
  applyCompanionSettings,
  type CompanionSettingApplied,
  type CompanionSettingChange,
} from './settings-apply';

/**
 * Persona profiles (Phase 109 Theme G) — named bundles of the companion's
 * voice, personality and what it calls you. **Names are never in one**
 * (Decision 5), so no switch can change the wake word.
 *
 * Three callers, as for every companion setting: the companion's own voice
 * ("save this as Narrator", "switch to Narrator"), an agent over the
 * `companion_profile_*` MCP tools, and the Profiles section on Settings ▸
 * Companion. Plain functions over `useUiStore.getState()`, no hooks, for the
 * reason `settings-apply.ts` gives.
 *
 * - **A switch is one change.** It writes the profile's two voices, its
 *   personality, its honorifics and `companionActiveProfile` through
 *   `applyCompanionSettings`, so the five land together or not at all, and
 *   "undo that" restores all of them. Personality goes in with `confirmed`
 *   and `tuned`: the switch is the consent (the active profile is a `direct`
 *   key, Decision 2) and the text was the user's own when they saved it, not
 *   dictation — which is all the `tunedText` guard exists to stop.
 * - **Editing never rewrites a profile.** Change the voice while Narrator is
 *   active and Narrator is *modified* — {@link isCompanionProfileModified},
 *   derived from the store, never stored — until it is saved over or
 *   switched to again.
 * - **Save, rename and delete edit the list.** They write
 *   `companionProfiles` (and the active id) straight to the store, not
 *   through the setter's undo slot: the list is not a setting, and "undo
 *   that" is about how the companion sounds. A delete asks first wherever it
 *   comes from, and so does a save over an existing name.
 * - **Every write is refused while the screen is locked.**
 */

export type CompanionProfileRefusal = 'locked' | 'notFound' | 'full' | 'invalid' | 'guard' | 'confirm';

export type CompanionProfileResult =
  | { ok: true; op: 'save'; profile: CompanionProfile; overwritten: boolean }
  | {
      ok: true;
      op: 'switch';
      profile: CompanionProfile;
      /** Whether anything actually changed — false when it was already this profile, unmodified. */
      changed: boolean;
      results: CompanionSettingApplied[];
    }
  | { ok: true; op: 'delete'; profile: CompanionProfile; wasActive: boolean }
  | { ok: true; op: 'rename'; profile: CompanionProfile; previousName: string }
  | {
      ok: false;
      reason: CompanionProfileRefusal;
      /** A sentence the companion can say as it stands. */
      message: string;
      /** The profile the refusal is about, when there is one — the one a save would overwrite. */
      profile?: CompanionProfile;
    };

export type CompanionProfileRefused = Extract<CompanionProfileResult, { ok: false }>;

/** What a save would do: a new profile, or an overwrite that needs a yes. */
export type CompanionProfileSavePreview =
  | { ok: true; name: string; existing: CompanionProfile | null }
  | CompanionProfileRefused;

export type CompanionProfilesState = {
  profiles: readonly CompanionProfile[];
  activeId: string | null;
  active: CompanionProfile | null;
  /** The active profile, edited since it was switched to or saved. Always false with none active. */
  modified: boolean;
};

const LOCKED_MESSAGE = 'The screen is locked — unlock it first.';

function refuse(reason: CompanionProfileRefusal, message: string, profile?: CompanionProfile): CompanionProfileRefused {
  return profile === undefined ? { ok: false, reason, message } : { ok: false, reason, message, profile };
}

const notFound = (name: string): CompanionProfileRefused =>
  refuse('notFound', `I don't have a profile called ${name.trim()}.`);

/** The profiles, which is active, and whether it has been edited since. */
export function readCompanionProfiles(state = useUiStore.getState()): CompanionProfilesState {
  const profiles = state.companionProfiles;
  const active = profiles.find((profile) => profile.id === state.companionActiveProfile) ?? null;
  return {
    profiles,
    activeId: active?.id ?? null,
    active,
    modified: active !== null && isCompanionProfileModified(active, state),
  };
}

function newProfileId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return random ?? `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Every check a save makes, writing nothing — whether the name is new, taken (an overwrite), or refused. */
export function previewSaveCompanionProfile(name: string): CompanionProfileSavePreview {
  const state = useUiStore.getState();
  if (state.screensaverLocked) return refuse('locked', LOCKED_MESSAGE);
  const trimmed = name.replace(/\s+/g, ' ').trim();
  const existing = findCompanionProfile(state.companionProfiles, trimmed);
  const sameName = existing !== null && existing.name.trim().toLowerCase() === trimmed.toLowerCase();
  if (!sameName) {
    const problem = companionProfileNameProblem(trimmed, state.companionProfiles);
    if (problem !== null) return refuse('invalid', problem);
    if (state.companionProfiles.length >= COMPANION_PROFILES_MAX) return refuse('full', COMPANION_PROFILES_FULL_MESSAGE);
  }
  return { ok: true, name: sameName && existing ? existing.name : trimmed, existing: sameName ? existing : null };
}

/**
 * Save the companion as it is now under `name`, and make that profile the
 * active one — it describes the current state exactly. A name already taken
 * is refused as `confirm` unless `overwrite` says the user said yes; the
 * overwrite keeps the profile's id, spelling and `createdAt`.
 */
export function saveCompanionProfile(
  name: string,
  options: { overwrite?: boolean; now?: () => Date } = {},
): CompanionProfileResult {
  const preview = previewSaveCompanionProfile(name);
  if (!preview.ok) return preview;
  const { existing } = preview;
  if (existing !== null && options.overwrite !== true) {
    return refuse('confirm', `There's already a profile called ${existing.name} — save over it?`, existing);
  }

  const state = useUiStore.getState();
  const parsed = CompanionProfileSchema.safeParse({
    id: existing?.id ?? newProfileId(),
    name: preview.name,
    ...companionProfileFields(state),
    createdAt: existing?.createdAt ?? (options.now?.() ?? new Date()).toISOString(),
  });
  if (!parsed.success) return refuse('invalid', "I can't save that as a profile.");
  const profile = parsed.data;

  const profiles =
    existing === null
      ? [...state.companionProfiles, profile]
      : state.companionProfiles.map((row) => (row.id === existing.id ? profile : row));
  useUiStore.setState({ companionProfiles: profiles, companionActiveProfile: profile.id });
  return { ok: true, op: 'save', profile, overwritten: existing !== null };
}

/** The setter changes a switch to `profile` is made of — five keys, one undo step. */
export function companionProfileChanges(profile: CompanionProfile): CompanionSettingChange[] {
  return [
    { key: 'companionVoices.local', value: profile.voices.local, profile: true },
    { key: 'companionVoices.system', value: profile.voices.system, profile: true },
    { key: 'companionPersonality', value: profile.personality, confirmed: true, tuned: true, profile: true },
    { key: 'companionHonorifics', value: [...profile.honorifics], profile: true },
    { key: 'companionActiveProfile', value: profile.id, profile: true },
  ];
}

/**
 * Switch to a saved profile — by name (any case) or id — as **one** change
 * through the setter, so "undo that" puts every field back together.
 * Switching to the active profile again throws away edits made since.
 */
export function switchCompanionProfile(nameOrId: string, source: CompanionSettingSource): CompanionProfileResult {
  const state = useUiStore.getState();
  if (state.screensaverLocked) return refuse('locked', LOCKED_MESSAGE);
  const profile = findCompanionProfile(state.companionProfiles, nameOrId);
  if (profile === null) return notFound(nameOrId);

  const result = applyCompanionSettings(companionProfileChanges(profile), source);
  if (!result.ok) {
    return refuse(result.reason === 'locked' ? 'locked' : result.reason === 'invalid' ? 'invalid' : 'guard', result.message, profile);
  }
  const changed = result.results.some((row) => JSON.stringify(row.previous) !== JSON.stringify(row.next));
  return { ok: true, op: 'switch', profile, changed, results: result.results };
}

/** Find what a delete would remove, writing nothing — for the question asked first. */
export function previewDeleteCompanionProfile(
  nameOrId: string,
): { ok: true; profile: CompanionProfile } | CompanionProfileRefused {
  const state = useUiStore.getState();
  if (state.screensaverLocked) return refuse('locked', LOCKED_MESSAGE);
  const profile = findCompanionProfile(state.companionProfiles, nameOrId);
  return profile === null ? notFound(nameOrId) : { ok: true, profile };
}

/**
 * Delete a profile. The companion keeps sounding the way it does — deleting
 * the active profile only leaves no profile active. Callers ask first.
 */
export function deleteCompanionProfile(nameOrId: string): CompanionProfileResult {
  const state = useUiStore.getState();
  if (state.screensaverLocked) return refuse('locked', LOCKED_MESSAGE);
  const profile = findCompanionProfile(state.companionProfiles, nameOrId);
  if (profile === null) return notFound(nameOrId);
  const wasActive = state.companionActiveProfile === profile.id;
  useUiStore.setState({
    companionProfiles: state.companionProfiles.filter((row) => row.id !== profile.id),
    ...(wasActive ? { companionActiveProfile: null } : {}),
  });
  return { ok: true, op: 'delete', profile, wasActive };
}

/** Rename a profile by id (the page's Rename). Its contents and active state are untouched. */
export function renameCompanionProfile(id: string, name: string): CompanionProfileResult {
  const state = useUiStore.getState();
  if (state.screensaverLocked) return refuse('locked', LOCKED_MESSAGE);
  const profile = state.companionProfiles.find((row) => row.id === id) ?? null;
  if (profile === null) return notFound(name);
  const trimmed = name.replace(/\s+/g, ' ').trim();
  const problem = companionProfileNameProblem(trimmed, state.companionProfiles, id);
  if (problem !== null) return refuse('invalid', problem, profile);
  const renamed: CompanionProfile = { ...profile, name: trimmed };
  useUiStore.setState({ companionProfiles: state.companionProfiles.map((row) => (row.id === id ? renamed : row)) });
  return { ok: true, op: 'rename', profile: renamed, previousName: profile.name };
}
