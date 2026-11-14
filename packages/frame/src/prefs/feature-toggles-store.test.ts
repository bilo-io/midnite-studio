import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useFeatureTogglesStore } from './feature-toggles-store';

describe('feature toggles store (Phase 135 Theme B)', () => {
  beforeEach(() => {
    useFeatureTogglesStore.setState({ disabled: [] });
    localStorage.clear();
  });
  afterEach(() => localStorage.clear());

  it('starts with everything on', () => {
    expect(useFeatureTogglesStore.getState().disabled).toEqual([]);
  });

  it('switching off cascades to dependents and on to requirements', () => {
    useFeatureTogglesStore.getState().setEnabled('chats', false);
    expect(useFeatureTogglesStore.getState().disabled).toEqual(['chats', 'councils']);
    useFeatureTogglesStore.getState().setEnabled('councils', true);
    expect(useFeatureTogglesStore.getState().disabled).toEqual([]);
  });

  it('persists the group and reads it back', async () => {
    useFeatureTogglesStore.getState().setEnabled('notes', false);
    const saved = localStorage.getItem('midnite.studio-features') ?? '{}';
    expect(JSON.parse(saved).state).toEqual({ disabled: ['notes'] });
    useFeatureTogglesStore.setState({ disabled: [] });
    localStorage.setItem('midnite.studio-features', saved);
    await useFeatureTogglesStore.persist.rehydrate();
    expect(useFeatureTogglesStore.getState().disabled).toEqual(['notes']);
  });

  it('reads a corrupt payload as everything on', async () => {
    localStorage.setItem('midnite.studio-features', JSON.stringify({ state: { disabled: 'notes' }, version: 1 }));
    await useFeatureTogglesStore.persist.rehydrate();
    expect(useFeatureTogglesStore.getState().disabled).toEqual([]);
  });
});
