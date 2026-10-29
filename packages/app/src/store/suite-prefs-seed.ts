import {
  ACTIVITY_PRESETS,
  SUITE_PREFS_GROUPS,
  type MidniteStudioBridge,
  type SuitePrefsKey,
  type SuitePrefsSetRequest,
} from '@midnite/studio-shared';

/**
 * Studio's one-time seed of the suite-prefs file (Phase 123 Theme L.1).
 *
 * The suite-prefs file is new; Studio's users already have their appearance,
 * palettes and title-bar status in this renderer's localStorage. Only the
 * renderer can read that, so on first boot — when `get` says the file holds no
 * group at all — it sends one `set` per group it has data for. The localStorage
 * keys stay untouched: the stores still read them until they move onto
 * suite-prefs (L.2), and they remain a fallback for one release after that.
 *
 * Never throws and never blocks boot: a failure leaves the file empty, and the
 * next start tries again.
 */

/** `midnite.settings` (appearance v2 + palette + activity palette) and `midnite.titlebar-status`. */
export const SEED_SETTINGS_KEY = 'midnite.settings';
export const SEED_TITLEBAR_STATUS_KEY = 'midnite.titlebar-status';

type SeedStorage = Pick<Storage, 'getItem'>;
export type SeedOutcome = 'seeded' | 'already-present' | 'nothing-to-seed' | 'unavailable';

/** A zustand `persist` blob's `state`, or null when absent or unparseable. */
function persistedState(storage: SeedStorage, key: string): Record<string, unknown> | null {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const state = (JSON.parse(raw) as { state?: unknown }).state;
    return state && typeof state === 'object' && !Array.isArray(state) ? (state as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function hasAnyField(state: Record<string, unknown>, key: SuitePrefsKey): boolean {
  return Object.keys(SUITE_PREFS_GROUPS[key].shape).some((field) => field in state);
}

/**
 * The `set` requests a first-run seed sends, one per group with data. Exported
 * for the test; {@link seedSuitePrefsFromLocalStorage} is the caller.
 *
 * `palette-store` and `activity-palette-store` share `midnite.settings` and both
 * name their selection `activePaletteId`, so the blob holds whichever wrote last.
 * The value is routed by what it names: an activity preset id seeds the activity
 * palette, anything else the theme palette; the other keeps its default.
 */
export function buildSeedRequests(storage: SeedStorage): SuitePrefsSetRequest[] {
  const requests: SuitePrefsSetRequest[] = [];
  const settings = persistedState(storage, SEED_SETTINGS_KEY);
  const titlebar = persistedState(storage, SEED_TITLEBAR_STATUS_KEY);

  const push = (key: SuitePrefsKey, state: Record<string, unknown>) => {
    if (!hasAnyField(state, key)) return;
    // Zod strips the fields that belong to the blob's other stores; a group whose
    // own fields fail validation is skipped rather than written as garbage.
    const parsed = SUITE_PREFS_GROUPS[key].safeParse(state);
    if (parsed.success) requests.push({ key, value: parsed.data } as SuitePrefsSetRequest);
  };

  if (settings) {
    const { activePaletteId, ...rest } = settings;
    const isActivityId = typeof activePaletteId === 'string' && activePaletteId in ACTIVITY_PRESETS;
    push('appearance', rest);
    push('palette', isActivityId || activePaletteId === undefined ? rest : { ...rest, activePaletteId });
    push('activityPalette', isActivityId ? { ...rest, activePaletteId } : rest);
  }
  if (titlebar) push('titlebarStatus', titlebar);
  return requests;
}

export async function seedSuitePrefsFromLocalStorage(
  bridge: MidniteStudioBridge['suitePrefs'] | undefined,
  storage: SeedStorage | undefined,
): Promise<SeedOutcome> {
  if (!bridge || !storage) return 'unavailable';
  try {
    const snapshot = await bridge.get();
    if (snapshot.stored.length > 0) return 'already-present';
    const requests = buildSeedRequests(storage);
    if (requests.length === 0) return 'nothing-to-seed';
    for (const request of requests) await bridge.set(request);
    return 'seeded';
  } catch {
    return 'unavailable';
  }
}
