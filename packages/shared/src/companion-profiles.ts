import {
  COMPANION_PROFILE_NAME_MAX,
  COMPANION_PROFILES_MAX,
  type CompanionProfile,
  type CompanionVoiceSelection,
} from './companion';

/**
 * Persona profiles (Phase 109 Theme G) — the pure half, shared by the page,
 * the companion's own voice and the `companion_profile_*` MCP tools so the
 * three agree on what "the same name" and "modified" mean.
 *
 * A profile is `CompanionProfileSchema` (`companion.ts`): a voice per engine,
 * the personality text and what it calls you. **Names are not in it**
 * (Decision 5) — they are the wake words, and a profile switch must never
 * change what you say to wake the companion.
 */

/** What a profile bundles — read off the store to save one, compared against it to mark one modified. */
export type CompanionProfileFields = {
  voices: CompanionVoiceSelection;
  personality: string;
  honorifics: readonly string[];
};

/** The fields as the store holds them, under their store keys. */
export type CompanionProfileSource = {
  companionVoices: CompanionVoiceSelection;
  companionPersonality: string;
  companionHonorifics: readonly string[];
};

/** The current values a profile would capture. */
export function companionProfileFields(state: CompanionProfileSource): CompanionProfileFields {
  return {
    voices: { local: state.companionVoices.local, system: state.companionVoices.system },
    personality: state.companionPersonality,
    honorifics: [...state.companionHonorifics],
  };
}

/** Case-insensitive, whitespace-collapsed — "the narrator" and "Narrator " are one name. */
export function normalizeCompanionProfileName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * A profile by name (case-insensitive) or by id — the id for the page and an
 * agent that listed them first, the name for a voice.
 */
export function findCompanionProfile(
  profiles: readonly CompanionProfile[],
  nameOrId: string,
): CompanionProfile | null {
  const wanted = normalizeCompanionProfileName(nameOrId);
  if (wanted === '') return null;
  return (
    profiles.find((profile) => normalizeCompanionProfileName(profile.name) === wanted) ??
    profiles.find((profile) => profile.id === nameOrId.trim()) ??
    null
  );
}

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/**
 * Whether the companion has moved off `profile` since it was switched to or
 * saved — the page's modified dot. Editing a bundled field while a profile is
 * active **marks** it modified; it never rewrites the profile behind the
 * user's back. Personality is compared trimmed, because the page keeps what
 * was typed (a trailing space included) while a saved profile is trimmed.
 */
export function isCompanionProfileModified(profile: CompanionProfile, current: CompanionProfileSource): boolean {
  const fields = companionProfileFields(current);
  return (
    fields.voices.local !== profile.voices.local ||
    fields.voices.system !== profile.voices.system ||
    fields.personality.trim() !== profile.personality.trim() ||
    !sameList(
      fields.honorifics.map((value) => value.trim()),
      profile.honorifics.map((value) => value.trim()),
    )
  );
}

/**
 * Why `name` cannot be a new profile's name — or a rename's — or `null`.
 * `exceptId` is the profile being renamed, which may keep its own name.
 * A clash is reported, not refused, by save: saving over a name is an
 * overwrite, and that is the caller's question to ask.
 */
export function companionProfileNameProblem(
  name: string,
  profiles: readonly CompanionProfile[],
  exceptId?: string,
): string | null {
  const trimmed = name.replace(/\s+/g, ' ').trim();
  if (trimmed === '') return 'A profile needs a name.';
  if (trimmed.length > COMPANION_PROFILE_NAME_MAX) {
    return `Keep it to ${COMPANION_PROFILE_NAME_MAX} characters.`;
  }
  const clash = findCompanionProfile(profiles, trimmed);
  if (clash !== null && clash.id !== exceptId && normalizeCompanionProfileName(clash.name) === normalizeCompanionProfileName(trimmed)) {
    return `There's already a profile called ${clash.name}.`;
  }
  return null;
}

/** What saving one more would hit: {@link COMPANION_PROFILES_MAX}. */
export const COMPANION_PROFILES_FULL_MESSAGE = `That's ${COMPANION_PROFILES_MAX} profiles already — delete one first.`;

/** "Narrator", "Narrator and Pirate", "Narrator, Pirate and Butler". */
export function joinCompanionProfileNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
