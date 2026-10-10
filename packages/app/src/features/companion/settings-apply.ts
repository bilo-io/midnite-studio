import {
  COMPANION_SETTING_KEYS,
  checkCompanionGuard,
  companionSettingSpec,
  companionSettingTier,
  parseCompanionSettingValue,
  type CompanionAccess,
  type CompanionSettingKey,
  type CompanionSettings,
  type CompanionSettingSource,
} from '@midnite/studio-shared';

import { useUiStore, type PersistedUi, type UiState } from '../../store/ui-store';
import { setCompanionVolume as applyLiveVolume } from './audio/context';

/**
 * The one way a companion setting changes (Phase 109 Theme B).
 *
 * Three callers, one path: the companion's own voice (Theme C's `setting`
 * intent), an agent over the `midnite` MCP server (Theme D's
 * `companion_settings_set`), and the Settings ▸ Companion page. Each goes
 * through the spec table in `shared/src/companion.ts` — value schema, tier,
 * guards — so the voice and the agent cannot drift from each other, and a page
 * change lands in the same undo slot "undo that" reads.
 *
 * **Plain functions over `useUiStore.getState()`, no hooks**, for the rule
 * `runtime.ts` already keeps: a spoken turn outlives the render that started
 * it, so nothing here may depend on a component being mounted.
 *
 * - **Lock:** every source is refused while the screen is locked — the same
 *   check `ui-requests.ts` makes for the `ui.*` tools.
 * - **Tiers bind `voice` and `mcp` only.** A `never` key is refused from
 *   either; a `confirm` key is refused unless the change says the user already
 *   said yes (`confirmed`), which Theme C's `pendingAction` and Theme D's
 *   in-app prompt set. The page's click is its own consent, so it skips tiers.
 * - **Guards bind everyone**, the page included — but `tunedText` lets the
 *   page through, since typing in the Personality box is exactly the
 *   non-dictation path that guard exists to keep open.
 *
 * {@link previewCompanionSetting} runs the same checks without writing, for
 * Theme E's `readBackBeforeApply`: the mute and the rename are read back
 * *before* the write, so the caller previews, speaks, then applies.
 */

/** How long "undo that" can reach back (Decision 9: one step, sixty seconds). */
export const COMPANION_UNDO_WINDOW_MS = 60_000;

/**
 * Page changes to the same key this close together are one undo step: a
 * slider drag or a sentence typed into Personality is a single change to the
 * person making it, not one per `onChange`.
 */
export const COMPANION_PAGE_COALESCE_MS = 5_000;

export type CompanionSettingChange = {
  key: CompanionSettingKey;
  value: unknown;
  /** The user already said yes to this `confirm`-tier change. Ignored for `page`. */
  confirmed?: boolean;
  /** Came out of Theme H's `tune`/`tweak` flow — the only voice path to personality and About me. */
  tuned?: boolean;
};

export type CompanionSettingRefusal = 'locked' | 'never' | 'confirm' | 'guard' | 'invalid';

export type CompanionSettingApplied = {
  ok: true;
  key: CompanionSettingKey;
  previous: unknown;
  next: unknown;
  /** The tier this change ran at — `companionSpeakAloud → true` is `direct` even though the key is `confirm`. */
  tier: CompanionAccess;
  /** Speak the read-back before writing (a rename, a mute) — Theme E's. */
  effect?: 'readBackBeforeApply';
};

export type CompanionSettingResult =
  | CompanionSettingApplied
  | {
      ok: false;
      key: CompanionSettingKey;
      reason: CompanionSettingRefusal;
      /** A sentence the companion can say as it stands. */
      message: string;
    };

export type CompanionSettingRefused = Extract<CompanionSettingResult, { ok: false }>;

export type CompanionSettingsBatchResult =
  | { ok: true; results: CompanionSettingApplied[] }
  | CompanionSettingRefused;

/** The one-step undo slot. One change may touch several keys (the page's conversation mode, Theme G's profile switch). */
export type CompanionLastChange = {
  keys: CompanionSettingKey[];
  previous: Partial<Record<CompanionSettingKey, unknown>>;
  at: number;
  source: CompanionSettingSource;
};

export type CompanionUndoResult =
  | {
      ok: true;
      keys: CompanionSettingKey[];
      /** The values written back, keyed like the change that set them. */
      restored: Partial<Record<CompanionSettingKey, unknown>>;
      source: CompanionSettingSource;
    }
  | { ok: false; reason: 'nothing' | 'expired' | 'locked' };

/*
  The store's persisted companion keys and the shared slice schema must name the
  same settings. `CompanionSettingsSchema`'s own assertion ties the schema to
  the spec table; this one ties the store to the schema, so a `companion*` key
  added to `PersistedUi` without a spec fails here.
*/
type StoreCompanionKey = Extract<keyof PersistedUi, `companion${string}` | `voiceConversation${string}`>;
type AssertStoreMatchesSlice = [StoreCompanionKey] extends [keyof CompanionSettings]
  ? [keyof CompanionSettings] extends [StoreCompanionKey]
    ? true
    : never
  : never;
const _assertStoreMatchesSlice: AssertStoreMatchesSlice = true;

type CompanionSettingsState = Pick<UiState, keyof CompanionSettings>;

let lastChange: CompanionLastChange | null = null;

const LOCKED_MESSAGE = 'The screen is locked — unlock it first.';

const isSettingKey = (key: unknown): key is CompanionSettingKey =>
  typeof key === 'string' && (COMPANION_SETTING_KEYS as readonly string[]).includes(key);

/** The current value of one setting, voice selection read per engine. */
export function readCompanionSetting(state: CompanionSettingsState, key: CompanionSettingKey): unknown {
  if (key === 'companionVoices.local') return state.companionVoices.local;
  if (key === 'companionVoices.system') return state.companionVoices.system;
  return state[key];
}

/** The store patch that writes one setting over `state`. */
function patchFor(
  state: CompanionSettingsState,
  key: CompanionSettingKey,
  value: unknown,
): Partial<CompanionSettingsState> {
  if (key === 'companionVoices.local' || key === 'companionVoices.system') {
    const engine = key === 'companionVoices.local' ? 'local' : 'system';
    return { companionVoices: { ...state.companionVoices, [engine]: value as string | null } };
  }
  return { [key]: value } as Partial<CompanionSettingsState>;
}

const sameValue = (a: unknown, b: unknown): boolean =>
  Object.is(a, b) || (typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b));

function refuse(key: CompanionSettingKey, reason: CompanionSettingRefusal, message: string): CompanionSettingRefused {
  return { ok: false, key, reason, message };
}

/** Every check, no write. `state` is passed so a batch can evaluate its second change against its first. */
function evaluate(
  change: CompanionSettingChange,
  source: CompanionSettingSource,
  state: CompanionSettingsState & Pick<UiState, 'screensaverLocked'>,
): CompanionSettingResult {
  const { key } = change;
  if (!isSettingKey(key)) {
    return refuse(key, 'invalid', "That isn't a setting I know.");
  }
  if (state.screensaverLocked) return refuse(key, 'locked', LOCKED_MESSAGE);

  const spec = companionSettingSpec(key);
  const parsed = parseCompanionSettingValue(key, change.value);
  /*
    The page writes free text on every keystroke, so it keeps what was typed:
    trimming each keystroke would swallow the space between two words before
    the second one arrives. The schema has still checked it (the 4000-character
    cap); `ask.ts` trims it on the way into a prompt, as it always has.

    A value the schema refuses still goes through the tier and the guards
    first, so a never-tier key is refused as `never` whatever it was set to,
    and an emptied names list gets `lastName`'s sentence rather than a bare
    "invalid".
  */
  const next = !parsed.ok || (source === 'page' && spec.value.kind === 'text') ? change.value : parsed.value;

  const tier = companionSettingTier(key, next);
  if (source !== 'page') {
    if (tier === 'never') {
      return refuse(key, 'never', `That one's in Settings, Companion — I can't change ${spec.label.toLowerCase()} myself.`);
    }
    if (tier === 'confirm' && change.confirmed !== true) {
      return refuse(key, 'confirm', `Changing ${spec.label.toLowerCase()} needs a yes first.`);
    }
  }

  const previous = readCompanionSetting(state, key);
  const guard = checkCompanionGuard(spec, previous, next, { source, tuned: change.tuned });
  if (!guard.ok) return refuse(key, 'guard', guard.reason);
  if (!parsed.ok) return refuse(key, 'invalid', `That isn't something ${spec.label} can be set to.`);

  return { ok: true, key, previous, next, tier, ...(guard.effect ? { effect: guard.effect } : {}) };
}

/** What {@link applyCompanionSetting} would do, without doing it. */
export function previewCompanionSetting(
  change: CompanionSettingChange,
  source: CompanionSettingSource,
): CompanionSettingResult {
  return evaluate(change, source, useUiStore.getState());
}

/**
 * Apply several changes as **one** change: all are checked first, against the
 * state each earlier one leaves, and nothing is written unless every one
 * passes. They share one undo slot, so "undo that" restores them together.
 */
export function applyCompanionSettings(
  changes: readonly CompanionSettingChange[],
  source: CompanionSettingSource,
): CompanionSettingsBatchResult {
  const state = useUiStore.getState();
  let draft: CompanionSettingsState & Pick<UiState, 'screensaverLocked'> = state;
  let patch: Partial<CompanionSettingsState> = {};
  const results: CompanionSettingApplied[] = [];

  for (const change of changes) {
    const result = evaluate(change, source, draft);
    if (!result.ok) return result;
    const step = patchFor(draft, result.key, result.next);
    draft = { ...draft, ...step };
    patch = { ...patch, ...step };
    results.push(result);
  }

  const changed = results.filter((result) => !sameValue(result.previous, result.next));
  if (changed.length === 0) return { ok: true, results };

  useUiStore.setState(patch);
  if ('companionVolume' in patch && typeof patch.companionVolume === 'number') {
    // The live master gain is not a store subscriber; the page used to be the
    // only thing that told it, which a spoken "volume 50" would bypass.
    applyLiveVolume(patch.companionVolume);
  }
  recordChange(changed, source);
  return { ok: true, results };
}

/**
 * Apply one change (Phase 109 Theme B) — validate against the spec and value
 * schema, refuse while locked, enforce the tier for `voice`/`mcp`, run the
 * guards, write, and take the undo slot.
 */
export function applyCompanionSetting(
  change: CompanionSettingChange,
  source: CompanionSettingSource,
): CompanionSettingResult {
  const result = applyCompanionSettings([change], source);
  return result.ok ? (result.results[0] as CompanionSettingApplied) : result;
}

function recordChange(results: readonly CompanionSettingApplied[], source: CompanionSettingSource): void {
  const now = Date.now();
  const keys = results.map((result) => result.key);
  const coalesce =
    source === 'page' &&
    lastChange !== null &&
    lastChange.source === 'page' &&
    now - lastChange.at < COMPANION_PAGE_COALESCE_MS &&
    lastChange.keys.length === keys.length &&
    lastChange.keys.every((key) => keys.includes(key));
  if (coalesce && lastChange !== null) {
    lastChange = { ...lastChange, at: now };
    return;
  }
  lastChange = {
    keys,
    previous: Object.fromEntries(results.map((result) => [result.key, result.previous])),
    at: now,
    source,
  };
}

/** The undo slot as it stands — Theme E's toast reads it to know what "Undo" would restore. */
export function lastCompanionSettingChange(): Readonly<CompanionLastChange> | null {
  return lastChange;
}

/**
 * Put the last change back (Decision 9): one step, from any source, within
 * {@link COMPANION_UNDO_WINDOW_MS}. Writes the previous values straight back —
 * they were valid when they were current — and empties the slot, so a second
 * "undo that" has nothing to undo rather than redoing.
 */
export function undoLastCompanionSetting(): CompanionUndoResult {
  if (lastChange === null) return { ok: false, reason: 'nothing' };
  const state = useUiStore.getState();
  if (state.screensaverLocked) return { ok: false, reason: 'locked' };
  if (Date.now() - lastChange.at > COMPANION_UNDO_WINDOW_MS) return { ok: false, reason: 'expired' };

  const { keys, previous, source } = lastChange;
  let draft: CompanionSettingsState = state;
  let patch: Partial<CompanionSettingsState> = {};
  for (const key of keys) {
    const step = patchFor(draft, key, previous[key]);
    draft = { ...draft, ...step };
    patch = { ...patch, ...step };
  }
  useUiStore.setState(patch);
  if (typeof patch.companionVolume === 'number') applyLiveVolume(patch.companionVolume);
  lastChange = null;
  return { ok: true, keys, restored: previous, source };
}

/** Empty the undo slot. Tests only. */
export function resetCompanionSettingUndoForTest(): void {
  lastChange = null;
}
