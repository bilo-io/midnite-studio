import { beforeEach, describe, expect, it } from 'vitest';

import { INITIAL_SETUP_STATE, isFirstRun, migrateSetupState, withPageSkipped } from './setup-state';
import { useUiStore } from './ui-store';

const NOW = '2026-09-29T12:00:00.000Z';

describe('migrateSetupState (Phase 98 Theme A)', () => {
  it('a fresh profile — neither old latch closed — is a first run', () => {
    const state = migrateSetupState({ onboardedAt: null, showOnboarding: true }, NOW);
    expect(state).toEqual(INITIAL_SETUP_STATE);
    expect(isFirstRun(state)).toBe(true);
  });

  it('a profile onboarded under FirstRunModal counts as done, keeping its own timestamp', () => {
    const state = migrateSetupState({ onboardedAt: '2026-01-01T00:00:00.000Z', showOnboarding: true }, NOW);
    expect(state.completedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(isFirstRun(state)).toBe(false);
  });

  it('a profile that closed OnboardingModal counts as done even with no onboardedAt', () => {
    const state = migrateSetupState({ onboardedAt: null, showOnboarding: false }, NOW);
    expect(state.completedAt).toBe(NOW);
    expect(isFirstRun(state)).toBe(false);
  });

  it("an old skip history carries over, minus the old wizard's mandatory 'welcome' step", () => {
    const state = migrateSetupState(
      { showOnboarding: false, onboardingSkippedStepIds: ['forges', 'welcome', 'forges', 7] },
      NOW,
    );
    expect(state.skippedPageIds).toEqual(['forges']);
  });

  it('tolerates a blob with none of the old keys', () => {
    expect(migrateSetupState({}, NOW)).toEqual(INITIAL_SETUP_STATE);
  });
});

describe('isFirstRun', () => {
  it('is false once setup is left early, not only once it is finished', () => {
    expect(isFirstRun({ ...INITIAL_SETUP_STATE, dismissedAt: NOW })).toBe(false);
    expect(isFirstRun({ ...INITIAL_SETUP_STATE, completedAt: NOW })).toBe(false);
  });
});

describe('withPageSkipped', () => {
  it('adds once and removes', () => {
    expect(withPageSkipped(['a'], 'a', true)).toEqual(['a']);
    expect(withPageSkipped(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(withPageSkipped(['a', 'b'], 'a', false)).toEqual(['b']);
  });
});

describe('ui-store v27 -> v28 migration', () => {
  beforeEach(() => {
    localStorage.clear();
    useUiStore.setState({ setupState: INITIAL_SETUP_STATE });
  });

  it('folds the three old keys into setupState and deletes them', () => {
    const migrate = useUiStore.persist.getOptions().migrate;
    const migrated = migrate?.(
      { onboardedAt: '2026-01-01T00:00:00.000Z', showOnboarding: false, onboardingSkippedStepIds: ['forges'] },
      27,
    ) as Record<string, unknown>;
    expect(migrated.setupState).toEqual({
      ...INITIAL_SETUP_STATE,
      completedAt: '2026-01-01T00:00:00.000Z',
      skippedPageIds: ['forges'],
    });
    expect('onboardedAt' in migrated).toBe(false);
    expect('showOnboarding' in migrated).toBe(false);
    expect('onboardingSkippedStepIds' in migrated).toBe(false);
  });

  it('an old onboarded blob round-trips through the real store as not-a-first-run', () => {
    localStorage.setItem(
      'midnite-studio.ui',
      JSON.stringify({ state: { onboardedAt: '2026-01-01T00:00:00.000Z', showOnboarding: false }, version: 27 }),
    );
    void useUiStore.persist.rehydrate();
    expect(isFirstRun(useUiStore.getState().setupState)).toBe(false);
  });

  it('an old fresh blob (both latches still open) stays a first run', () => {
    localStorage.setItem(
      'midnite-studio.ui',
      JSON.stringify({ state: { onboardedAt: null, showOnboarding: true }, version: 27 }),
    );
    void useUiStore.persist.rehydrate();
    expect(isFirstRun(useUiStore.getState().setupState)).toBe(true);
  });
});
