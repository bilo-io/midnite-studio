import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { defaultFeatureFlags } from '@midnite/studio-shared';

import { useFeatureFlagsStore } from './feature-flags-store';

describe('feature flags store (Phase 134 Theme D)', () => {
  beforeEach(() => {
    useFeatureFlagsStore.setState({ flags: defaultFeatureFlags() });
    localStorage.clear();
  });
  afterEach(() => localStorage.clear());

  it('starts with councils.pro off and turns it on', () => {
    expect(useFeatureFlagsStore.getState().flags['councils.pro']).toBe(false);
    useFeatureFlagsStore.getState().setFlag('councils.pro', true);
    expect(useFeatureFlagsStore.getState().flags['councils.pro']).toBe(true);
  });

  it('persists the flags record itself and reads it back', async () => {
    useFeatureFlagsStore.getState().setFlag('councils.pro', true);
    const saved = localStorage.getItem('midnite.feature-flags') ?? '{}';
    expect(JSON.parse(saved).state).toEqual({ 'councils.pro': true });
    // a reset writes the defaults back, so put the saved blob back before reading it
    useFeatureFlagsStore.setState({ flags: defaultFeatureFlags() });
    localStorage.setItem('midnite.feature-flags', saved);
    await useFeatureFlagsStore.persist.rehydrate();
    expect(useFeatureFlagsStore.getState().flags['councils.pro']).toBe(true);
  });

  it('falls back to the defaults on a corrupt payload', async () => {
    localStorage.setItem('midnite.feature-flags', JSON.stringify({ state: { 'councils.pro': 'yes' }, version: 1 }));
    await useFeatureFlagsStore.persist.rehydrate();
    expect(useFeatureFlagsStore.getState().flags['councils.pro']).toBe(false);
  });
});
