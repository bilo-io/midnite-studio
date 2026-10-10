import { z } from 'zod';

import {
  COMPANION_LOCAL_VOICES,
  COMPANION_SETTING_KEYS,
  CompanionLocalVoiceIdSchema,
  companionSettingSpec,
  companionSettingTier,
  type CompanionSettingKey,
} from './companion';

/**
 * The `companion_*` tools on the `midnite` MCP server (Phase 109 Theme D):
 * `companion_settings_get`, `companion_settings_set` and
 * `companion_voices_list`, so an agent in a terminal can change the
 * companion for the user.
 *
 * They read and write through the same spec table (`companion.ts`'s
 * `COMPANION_SETTING_SPECS`) and the same renderer setter
 * (`app/features/companion/settings-apply.ts`) the companion's own voice uses,
 * so the two ways in cannot drift. Companion settings stay renderer-owned:
 * main reaches them only through `requestUiAction`
 * (`desktop/src/main/companion/ui-bridge.ts`).
 *
 * **One switch gates the whole family, reads included** (Decision 13):
 * `Settings ▸ MCP ▸ Let agents change companion settings` (`allowCompanionSettings`),
 * off by default. About me is personal, the same reasoning that puts the
 * read-only `ui.state` behind `allowUi`'s page.
 *
 * **Consent is switch + tier + an in-app confirm the call waits for**
 * (Decision 3). A `direct` key applies at once. A `confirm` key asks the user
 * in the app — aloud with the Run/Cancel chip when the companion is on, a
 * plain dialog when it is off — and the call waits up to
 * {@link COMPANION_MCP_CONFIRM_MS} for the answer. After that it returns
 * `timeout` and nothing applies, however late a "yes" arrives. A `never` key
 * is refused.
 */

/** The refusal every `companion_*` tool answers with while `McpSettings.allowCompanionSettings` is off. */
export const COMPANION_SETTINGS_OFF_MESSAGE =
  'Companion settings are off — Settings ▸ MCP ▸ Let agents change companion settings';

/** How long a confirm-tier `companion_settings_set` waits for the user's answer in the app. */
export const COMPANION_MCP_CONFIRM_MS = 30_000;

/**
 * Main's own wait runs this much longer than the renderer's prompt, so the
 * renderer's `timeout` reply is what an agent normally sees. Main's timer is
 * the backstop for a window that stopped answering altogether.
 */
export const COMPANION_MCP_REPLY_GRACE_MS = 5_000;

/** What the companion says to a "yes" that arrives after the agent stopped waiting. */
export const COMPANION_MCP_TOO_LATE = 'Too late — ask your agent again.';

/**
 * How long main's `requestUiAction` waits for one `companion_settings_set`:
 * the prompt plus its grace for a `confirm`-tier change, the bridge's own
 * default (`undefined`) for everything else, which the renderer answers at
 * once.
 */
export function companionSettingSetTimeoutMs(key: CompanionSettingKey, value: unknown): number | undefined {
  return companionSettingTier(key, value) === 'confirm'
    ? COMPANION_MCP_CONFIRM_MS + COMPANION_MCP_REPLY_GRACE_MS
    : undefined;
}

export const CompanionSettingKeySchema = z.enum(COMPANION_SETTING_KEYS);
const CompanionAccessSchema = z.enum(['direct', 'confirm', 'never']);

/** The values one setting takes, for an agent — the spec's value kind without the spoken words. */
export const CompanionSettingAllowedSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('bool') }),
  z.object({ kind: z.literal('enum'), values: z.array(z.string()), nullable: z.boolean() }),
  z.object({ kind: z.literal('number'), min: z.number(), max: z.number(), step: z.number() }),
  z.object({ kind: z.literal('text'), max: z.number().int(), nullable: z.boolean() }),
  z.object({ kind: z.literal('list'), min: z.number().int() }),
]);
export type CompanionSettingAllowed = z.infer<typeof CompanionSettingAllowedSchema>;

export const CompanionSettingEntrySchema = z.object({
  key: CompanionSettingKeySchema,
  label: z.string(),
  value: z.unknown(),
  /** The strictest tier the key has; `directValues` lists the values that drop it to `direct`. */
  tier: CompanionAccessSchema,
  directValues: z.array(z.unknown()).optional(),
  /** Whether `companion_settings_set` can ever change it. Never `true` for a `never`-tier key. */
  settable: z.boolean(),
  /** Why `settable` is false. */
  note: z.string().optional(),
  allowed: CompanionSettingAllowedSchema,
});
export type CompanionSettingEntry = z.infer<typeof CompanionSettingEntrySchema>;

export const CompanionSettingsGetOutputSchema = z.object({
  settings: z.array(CompanionSettingEntrySchema),
  /** While the screen is locked every `companion_settings_set` is refused. */
  locked: z.boolean(),
});
export type CompanionSettingsGetOutput = z.infer<typeof CompanionSettingsGetOutputSchema>;

export const CompanionSettingsSetInputSchema = z.object({
  key: CompanionSettingKeySchema,
  /** Checked against the key's own value schema in the renderer, never here, so main cannot be talked into a different one. */
  value: z.unknown(),
});

export const COMPANION_SETTING_SET_STATUSES = ['applied', 'approved', 'declined', 'timeout', 'refused'] as const;
export type CompanionSettingSetStatus = (typeof COMPANION_SETTING_SET_STATUSES)[number];

/** `settings-apply.ts`'s refusal reasons — `confirm` never reaches an agent, since the app asks instead. */
export const CompanionSettingRefusalSchema = z.enum(['locked', 'never', 'confirm', 'guard', 'invalid']);

export const CompanionSettingsSetOutputSchema = z.object({
  /**
   * `applied`: a `direct` change, done. `approved`: a `confirm` change the user
   * said yes to, done. `declined`: they said no. `timeout`: no answer within
   * {@link COMPANION_MCP_CONFIRM_MS}; nothing changed. `refused`: see `reason`.
   */
  status: z.enum(COMPANION_SETTING_SET_STATUSES),
  key: CompanionSettingKeySchema,
  reason: CompanionSettingRefusalSchema.optional(),
  /** A sentence that says why, for `refused`. */
  message: z.string().optional(),
  previous: z.unknown().optional(),
  next: z.unknown().optional(),
});
export type CompanionSettingsSetOutput = z.infer<typeof CompanionSettingsSetOutputSchema>;

/** One `speechSynthesis` voice, as the renderer lists it — the only place that list exists. */
export const CompanionSystemVoiceSchema = z.object({
  voiceURI: z.string(),
  name: z.string(),
  lang: z.string(),
  default: z.boolean(),
});
export type CompanionSystemVoice = z.infer<typeof CompanionSystemVoiceSchema>;

export const CompanionVoicesListOutputSchema = z.object({
  /** The Kokoro voices; set one with `companionVoices.local` and its `id`. */
  local: z.array(
    z.object({
      id: CompanionLocalVoiceIdSchema,
      name: z.string(),
      language: z.enum(['en-us', 'en-gb']),
      gender: z.enum(['Female', 'Male']),
      grade: z.string(),
      spoken: z.array(z.string()),
      /** The local voice model is on disk, so this voice speaks without a download first. */
      downloaded: z.boolean(),
    }),
  ),
  /** The OS voices; set one with `companionVoices.system` and its `voiceURI`. */
  system: z.array(CompanionSystemVoiceSchema),
  selected: z.object({
    local: CompanionLocalVoiceIdSchema.nullable(),
    system: z.string().nullable(),
  }),
});
export type CompanionVoicesListOutput = z.infer<typeof CompanionVoicesListOutputSchema>;

const NEVER_NOTE = 'Only from Settings ▸ Companion.';
const TUNED_NOTE = "Only from Settings ▸ Companion or the companion's own tune-me interview.";

function allowedFor(key: CompanionSettingKey): CompanionSettingAllowed {
  const value = companionSettingSpec(key).value;
  switch (value.kind) {
    case 'bool':
      return { kind: 'bool' };
    case 'enum':
      return { kind: 'enum', values: [...value.values], nullable: value.nullable === true };
    case 'number':
      return { kind: 'number', min: value.min, max: value.max, step: value.step };
    case 'text':
      return { kind: 'text', max: value.max, nullable: value.nullable === true };
    case 'list':
      return { kind: 'list', min: value.min };
  }
}

/**
 * `companion_settings_get`'s answer, built from the renderer's raw values and
 * the shared spec table — so the tier, the allowed values and whether an
 * agent can set a key all come from the one list the setter enforces.
 *
 * A `never`-tier key is listed with its value and `settable: false`. So are
 * personality and About me, whose `tunedText` guard refuses anything an agent
 * sends: listing them as settable would only invite a refusal.
 */
export function describeCompanionSettings(
  values: Partial<Record<CompanionSettingKey, unknown>>,
  locked: boolean,
): CompanionSettingsGetOutput {
  const settings = COMPANION_SETTING_KEYS.map((key): CompanionSettingEntry => {
    const spec = companionSettingSpec(key);
    const tunedOnly = spec.guards?.includes('tunedText') === true;
    const settable = spec.tier !== 'never' && !tunedOnly;
    return {
      key,
      label: spec.label,
      value: values[key] ?? null,
      tier: spec.tier,
      ...(spec.directValues ? { directValues: [...spec.directValues] } : {}),
      settable,
      ...(settable ? {} : { note: spec.tier === 'never' ? NEVER_NOTE : TUNED_NOTE }),
      allowed: allowedFor(key),
    };
  });
  return { settings, locked };
}

/** `companion_voices_list`'s Kokoro half — the catalog, with whether the model is on disk. */
export function describeCompanionLocalVoices(downloaded: boolean): CompanionVoicesListOutput['local'] {
  return COMPANION_LOCAL_VOICES.map((voice) => ({
    id: voice.id,
    name: voice.name,
    language: voice.language,
    gender: voice.gender,
    grade: voice.grade,
    spoken: [...voice.spoken],
    downloaded,
  }));
}
