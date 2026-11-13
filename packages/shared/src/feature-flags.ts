import { z } from 'zod';

import { MIDNITE_SITE_ORIGIN } from './install-command';

/**
 * Feature flags (Phase 134 Theme D) — switches for product surfaces that are
 * not on for everyone. One table: the suite-prefs `featureFlags` group, the
 * frame's store and the Settings testing toggle all derive from it.
 *
 * A flag here is a local switch, not an entitlement: nothing checks an account
 * or a licence. `councils.pro` lifts the councils member cap from 3 to 6.
 */
export const FEATURE_FLAGS = {
  'councils.pro': {
    label: 'Councils Pro',
    description: 'Councils of up to 6 members (free councils hold up to 3).',
    default: false,
  },
} as const satisfies Record<string, { label: string; description: string; default: boolean }>;

export type FeatureFlagId = keyof typeof FEATURE_FLAGS;
export const FEATURE_FLAG_IDS = Object.keys(FEATURE_FLAGS) as FeatureFlagId[];

/** The suite-prefs group: one boolean per flag, each defaulting to the table's value. */
export const FeatureFlagsPrefsSchema = z.object(
  Object.fromEntries(FEATURE_FLAG_IDS.map((id) => [id, z.boolean().default(FEATURE_FLAGS[id].default)])) as {
    [K in FeatureFlagId]: z.ZodDefault<z.ZodBoolean>;
  },
);
export type FeatureFlagsPrefs = z.infer<typeof FeatureFlagsPrefsSchema>;

/** Every flag at its default. */
export function defaultFeatureFlags(): FeatureFlagsPrefs {
  return FeatureFlagsPrefsSchema.parse({});
}

/** The website's pricing page, where "Upgrade to Pro" sends people. */
export const MIDNITE_PRICING_URL = `${MIDNITE_SITE_ORIGIN}/pricing/`;
