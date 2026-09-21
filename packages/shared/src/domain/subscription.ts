import { z } from 'zod';

/**
 * Subscription tier vocabulary for future billing work.
 *
 * **Unwired.** Nothing in the app or desktop reads this module today — a name
 * here is not a gate. Billing enforcement lands in a later phase; this file
 * exists so that work inherits a tier model and so the phase doc's forward
 * constraints have somewhere to point.
 *
 * Tiers are **feature entitlements**, not an ordinal ladder. `tier >=
 * 'individual'` cannot express "Team buys seats, Pro buys Councils" without a
 * rewrite, so each tier carries an explicit feature set instead.
 */

export const SubscriptionTierSchema = z.enum(['free', 'individual', 'team']);
export type SubscriptionTier = z.infer<typeof SubscriptionTierSchema>;

/**
 * Features a tier may grant. Higher tiers add seats and premium surfaces later
 * (Councils, Workflows, Video Editor) without changing this shape.
 */
export const TierFeatureSchema = z.enum([
  'privateRepos',
  'teamSeats',
  'councils',
  'workflows',
  'videoEditor',
]);
export type TierFeature = z.infer<typeof TierFeatureSchema>;

/** Which features each tier includes. Absent keys are not granted. */
export type TierEntitlements = Readonly<Record<TierFeature, boolean>>;

export const TIER_ENTITLEMENTS: Readonly<Record<SubscriptionTier, TierEntitlements>> = {
  free: {
    privateRepos: false,
    teamSeats: false,
    councils: false,
    workflows: false,
    videoEditor: false,
  },
  individual: {
    privateRepos: true,
    teamSeats: false,
    councils: false,
    workflows: false,
    videoEditor: false,
  },
  team: {
    privateRepos: true,
    teamSeats: true,
    councils: false,
    workflows: false,
    videoEditor: false,
  },
};
