import { describe, expect, it } from 'vitest';

import { defaultFeatureFlags, FEATURE_FLAG_IDS, FeatureFlagsPrefsSchema, MIDNITE_PRICING_URL } from './feature-flags';
import { MIDNITE_SITE_ORIGIN } from './install-command';
import { resolveSuitePrefs } from './suite-prefs';

describe('feature flags', () => {
  it('ships councils.pro, off by default', () => {
    expect(FEATURE_FLAG_IDS).toContain('councils.pro');
    expect(defaultFeatureFlags()['councils.pro']).toBe(false);
  });

  it('keeps a stored value and drops unknown flags', () => {
    expect(FeatureFlagsPrefsSchema.parse({ 'councils.pro': true, 'nope.flag': true })).toEqual({ 'councils.pro': true });
  });

  it('is a suite-prefs group that defaults when the file has none', () => {
    const { prefs, stored } = resolveSuitePrefs({ version: 1 });
    expect(prefs.featureFlags['councils.pro']).toBe(false);
    expect(stored).not.toContain('featureFlags');
    expect(resolveSuitePrefs({ version: 1, featureFlags: { 'councils.pro': true } }).prefs.featureFlags['councils.pro']).toBe(true);
  });

  it('sends upgrades to the website pricing page', () => {
    expect(MIDNITE_PRICING_URL).toBe(`${MIDNITE_SITE_ORIGIN}/pricing/`);
  });
});
