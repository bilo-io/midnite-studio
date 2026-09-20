import { describe, expect, it } from 'vitest';

import {
  SubscriptionTierSchema,
  TIER_ENTITLEMENTS,
  TierFeatureSchema,
} from './subscription';

describe('subscription vocabulary', () => {
  it('parses the three shipped tiers', () => {
    expect(SubscriptionTierSchema.parse('free')).toBe('free');
    expect(SubscriptionTierSchema.parse('individual')).toBe('individual');
    expect(SubscriptionTierSchema.parse('team')).toBe('team');
  });

  it('models entitlements as explicit feature flags, not ordinals', () => {
    expect(TIER_ENTITLEMENTS.individual.privateRepos).toBe(true);
    expect(TIER_ENTITLEMENTS.individual.teamSeats).toBe(false);
    expect(TIER_ENTITLEMENTS.team.teamSeats).toBe(true);
    expect(TIER_ENTITLEMENTS.free.councils).toBe(false);
  });

  it('reserves future premium features on every tier record', () => {
    for (const tier of SubscriptionTierSchema.options) {
      for (const feature of TierFeatureSchema.options) {
        expect(typeof TIER_ENTITLEMENTS[tier][feature]).toBe('boolean');
      }
    }
  });
});
