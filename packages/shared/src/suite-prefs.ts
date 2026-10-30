import { z } from 'zod';

import { CompanionSttEngineSchema, CompanionVoiceSelectionSchema, SttProviderIdSchema } from './companion';
import { ActivityStatusSchema, ActivityStatusStyleSchema, DEFAULT_ACTIVITY_PALETTE_ID } from './activity-palette';

/**
 * The suite-prefs file (Phase 123 Theme L.1, Decision 6) — the preferences every
 * suite app shares, in one file under `<appData>/Midnite Runtime/`.
 *
 * Each app has its own `userData` and renderer origin, so localStorage cannot
 * carry a theme change from one app to another. This file can: every app's main
 * serves it over `suitePrefsGet` / `suitePrefsSet` and watches it, so a change
 * in one app reaches every open one as `suitePrefsChanged`.
 *
 * The file holds **groups**, one per top-level key. A write replaces one group
 * whole (read-merge-write per key, last writer wins per key), so two apps
 * writing different groups at once never lose each other's change. Every field
 * carries a default and each group is read independently: a group that fails
 * to parse falls back to its defaults without taking the rest with it.
 *
 * Groups strip unknown keys (no `.passthrough()`), so the file only ever holds
 * fields some app declared. The companion, terminal and monitor groups start
 * with the one field each owning theme (F, E, K) names; those themes add the rest.
 */

export const SUITE_PREFS_FILE_NAME = 'suite-prefs.json';
export const SUITE_PREFS_VERSION = 1;

// ── appearance ────────────────────────────────────────────────────────────────
// Mirrors `@bilo-io/shell`'s appearance runtime (Studio's `appearance-store.ts`).
// The defaults are the shell's own (`BACKGROUND_PATTERN_DEFAULT` = 'none',
// `BG_INTENSITY_DEFAULT` = 'balanced', `DEFAULT_EFFECTS` = all on) restated here,
// because `shared` is zod-only and may not import the shell.

export const AccentIdSchema = z.enum(['default', 'blue', 'violet', 'emerald', 'amber', 'rose', 'cyan', 'orange']);

export const AppearancePrefsSchema = z.object({
  accent: AccentIdSchema.default('default'),
  motion: z.enum(['system', 'reduced', 'full']).default('system'),
  density: z.enum(['comfortable', 'compact']).default('comfortable'),
  uiFont: z.enum(['system', 'grotesk', 'humanist', 'serif', 'mono']).default('system'),
  background: z.string().min(1).max(64).default('none'),
  bgIntensity: z.enum(['subtle', 'balanced', 'bold']).default('balanced'),
  effects: z
    .object({
      pageReveal: z.boolean().default(true),
      typewriter: z.boolean().default(true),
      glass: z.boolean().default(true),
    })
    .default({}),
  shimmer: z.enum(['ltr', 'rtl']).default('ltr'),
});
export type AppearancePrefs = z.infer<typeof AppearancePrefsSchema>;

// ── palette ───────────────────────────────────────────────────────────────────
// Studio's `features/themes/palette-store.ts`. A user palette is stored whole:
// its terminal/editor halves are structural records here because their real
// types (xterm `ITheme`, monaco rules) live in renderer-only packages.

export const DEFAULT_THEME_PALETTE_ID = 'github-dark';

export const UserPaletteSchema = z.object({
  id: z.string().min(1).max(128),
  label: z.string().max(256),
  appearance: z.enum(['dark', 'light']),
  chrome: z.record(z.string()),
  terminal: z.record(z.unknown()),
  editor: z.object({
    base: z.enum(['vs', 'vs-dark', 'hc-black']),
    rules: z.array(z.record(z.unknown())),
    colors: z.record(z.string()),
  }),
  highlight: z.string(),
});
export type UserPalette = z.infer<typeof UserPaletteSchema>;

export const PalettePrefsSchema = z.object({
  activePaletteId: z.string().min(1).max(128).default(DEFAULT_THEME_PALETTE_ID),
  terminalPaletteOverride: z.string().min(1).max(128).nullable().default(null),
  editorPaletteOverride: z.string().min(1).max(128).nullable().default(null),
  userPalettes: z.array(UserPaletteSchema).max(200).default([]),
});
export type PalettePrefs = z.infer<typeof PalettePrefsSchema>;

// ── activity palette ──────────────────────────────────────────────────────────
// Studio's `features/activity/activity-palette-store.ts`. Its own top-level key
// rather than a field of `palette`: the two are separate stores, and a write
// replaces one key whole, so sharing a key would let either clobber the other.

const ACTIVITY_OVERRIDES_SHAPE = Object.fromEntries(
  ActivityStatusSchema.options.map((status) => [status, ActivityStatusStyleSchema.optional()]),
) as Record<z.infer<typeof ActivityStatusSchema>, ReturnType<typeof ActivityStatusStyleSchema.optional>>;

export const ActivityPalettePrefsSchema = z.object({
  activePaletteId: z.string().min(1).max(128).default(DEFAULT_ACTIVITY_PALETTE_ID),
  statusOverrides: z.object(ACTIVITY_OVERRIDES_SHAPE).default({}),
  agentStyle: z.enum(['gradient', 'metallic']).default('gradient'),
  shellStyle: z.enum(['metallic', 'gradient', 'matchAgent']).default('metallic'),
});
export type ActivityPalettePrefs = z.infer<typeof ActivityPalettePrefsSchema>;

// ── title-bar status ──────────────────────────────────────────────────────────
// Studio's `features/titlebar-status/titlebar-status-store.ts`.

export const DEFAULT_WORLD_CLOCK_ZONES = [
  { label: 'London', tz: 'Europe/London' },
  { label: 'New York', tz: 'America/New_York' },
  { label: 'Tokyo', tz: 'Asia/Tokyo' },
  { label: 'San Francisco', tz: 'America/Los_Angeles' },
] as const;

const ClockModeSchema = z.enum(['digital', 'analogue']);

export const TitlebarStatusPrefsSchema = z.object({
  showDate: z.boolean().default(true),
  showTime: z.boolean().default(true),
  showWeather: z.boolean().default(true),
  weatherUnits: z.enum(['c', 'f']).default('c'),
  weatherLocation: z
    .object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      label: z.string().max(256).optional(),
    })
    .nullable()
    .default(null),
  clockMode: ClockModeSchema.default('digital'),
  showSeconds: z.boolean().default(false),
  worldClocksMode: ClockModeSchema.default('digital'),
  worldClockZones: z
    .array(z.object({ label: z.string().max(128), tz: z.string().min(1).max(64) }))
    .max(50)
    .default(() => DEFAULT_WORLD_CLOCK_ZONES.map((zone) => ({ ...zone }))),
  visibleSections: z
    .object({
      calendar: z.boolean().default(true),
      weather: z.boolean().default(true),
      worldClocks: z.boolean().default(true),
      time: z.boolean().default(true),
    })
    .default({}),
});
export type TitlebarStatusPrefs = z.infer<typeof TitlebarStatusPrefsSchema>;

// ── companion / terminal / monitor ────────────────────────────────────────────
// Seeded with the field each owning theme names; Themes F, E and K add the rest.

export const CompanionPrefsSchema = z.object({
  enabled: z.boolean().default(false),
  /** Theme F: the voice per engine and the speech-to-text provider — set once, heard in every app. */
  voices: CompanionVoiceSelectionSchema.default({ system: null, local: null }),
  sttEngine: CompanionSttEngineSchema.default('server'),
  sttProvider: SttProviderIdSchema.nullable().default(null),
});
export type CompanionPrefs = z.infer<typeof CompanionPrefsSchema>;

export const TerminalPrefsSchema = z.object({
  /** Theme E: list every app's broker sessions, not only this app's. */
  showAllApps: z.boolean().default(false),
});
export type TerminalPrefs = z.infer<typeof TerminalPrefsSchema>;

export const MonitorPrefsSchema = z.object({});
export type MonitorPrefs = z.infer<typeof MonitorPrefsSchema>;

// ── the file ──────────────────────────────────────────────────────────────────

/** Every group, by its top-level key. The one table the schemas below derive from. */
export const SUITE_PREFS_GROUPS = {
  appearance: AppearancePrefsSchema,
  palette: PalettePrefsSchema,
  activityPalette: ActivityPalettePrefsSchema,
  titlebarStatus: TitlebarStatusPrefsSchema,
  companion: CompanionPrefsSchema,
  terminal: TerminalPrefsSchema,
  monitor: MonitorPrefsSchema,
} as const;

export type SuitePrefsKey = keyof typeof SUITE_PREFS_GROUPS;
export const SUITE_PREFS_KEYS = Object.keys(SUITE_PREFS_GROUPS) as SuitePrefsKey[];
export const SuitePrefsKeySchema = z.enum(SUITE_PREFS_KEYS as [SuitePrefsKey, ...SuitePrefsKey[]]);

/** The file on disk: every group optional, since a fresh file holds only what someone wrote. */
export const SuitePrefsSchema = z
  .object({
    version: z.literal(SUITE_PREFS_VERSION),
    appearance: AppearancePrefsSchema,
    palette: PalettePrefsSchema,
    activityPalette: ActivityPalettePrefsSchema,
    titlebarStatus: TitlebarStatusPrefsSchema,
    companion: CompanionPrefsSchema,
    terminal: TerminalPrefsSchema,
    monitor: MonitorPrefsSchema,
  })
  .partial();
export type SuitePrefsFile = z.infer<typeof SuitePrefsSchema>;

/** Every group present, defaults filled in — what a reader is always handed. */
export type ResolvedSuitePrefs = { [K in SuitePrefsKey]: z.infer<(typeof SUITE_PREFS_GROUPS)[K]> };

export function defaultSuitePrefs(): ResolvedSuitePrefs {
  const out = {} as Record<SuitePrefsKey, unknown>;
  for (const key of SUITE_PREFS_KEYS) out[key] = SUITE_PREFS_GROUPS[key].parse({});
  return out as ResolvedSuitePrefs;
}

/**
 * Resolve whatever JSON the file held into every group, defaulted. A group that
 * is absent or fails its schema reads as its defaults; `stored` lists only the
 * groups that were present and valid, which is what a first-run seed keys on.
 */
export function resolveSuitePrefs(raw: unknown): { prefs: ResolvedSuitePrefs; stored: SuitePrefsKey[] } {
  const prefs = defaultSuitePrefs();
  const stored: SuitePrefsKey[] = [];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { prefs, stored };
  const record = raw as Record<string, unknown>;
  for (const key of SUITE_PREFS_KEYS) {
    if (!(key in record)) continue;
    const parsed = SUITE_PREFS_GROUPS[key].safeParse(record[key]);
    if (!parsed.success) continue;
    (prefs as Record<SuitePrefsKey, unknown>)[key] = parsed.data;
    stored.push(key);
  }
  return { prefs, stored };
}

// ── the wire ──────────────────────────────────────────────────────────────────

/** `suitePrefsGet`'s answer and `suitePrefsChanged`'s payload. */
export const SuitePrefsSnapshotSchema = z.object({
  prefs: z.object(SUITE_PREFS_GROUPS),
  /** Groups the file actually holds; empty means nothing was ever written (the seed's cue). */
  stored: z.array(SuitePrefsKeySchema),
});
export type SuitePrefsSnapshot = z.infer<typeof SuitePrefsSnapshotSchema>;

/**
 * `suitePrefsSet`'s payload: one group, replaced whole. The value is validated
 * against its own key's schema (defaults fill any field the caller left out).
 */
export const SuitePrefsSetRequestSchema = z
  .object({ key: SuitePrefsKeySchema, value: z.unknown() })
  .transform((req, ctx) => {
    const parsed = SUITE_PREFS_GROUPS[req.key].safeParse(req.value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value', ...(issue?.path ?? [])],
        message: `suite-prefs ${req.key}: ${issue?.message ?? 'invalid value'}`,
      });
      return z.NEVER;
    }
    return { key: req.key, value: parsed.data } as ResolvedSuitePrefsEntry;
  });

/** Typed per key for callers; the schema above enforces the same pairing at runtime. */
export type SuitePrefsSetRequest = {
  [K in SuitePrefsKey]: { key: K; value: z.input<(typeof SUITE_PREFS_GROUPS)[K]> };
}[SuitePrefsKey];

/** A validated set request: the key and its group's parsed (defaulted) value. */
export type ResolvedSuitePrefsEntry = {
  [K in SuitePrefsKey]: { key: K; value: ResolvedSuitePrefs[K] };
}[SuitePrefsKey];

export const SuitePrefsSetResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), snapshot: SuitePrefsSnapshotSchema }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type SuitePrefsSetResponse = z.infer<typeof SuitePrefsSetResponseSchema>;
