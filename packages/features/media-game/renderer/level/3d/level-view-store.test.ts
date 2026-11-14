import { afterEach, describe, expect, it } from 'vitest';

import { levelViewMode, useLevelViewStore } from './level-view-store';

const KEY = 'midnite-studio.level-view';

afterEach(() => {
  localStorage.clear();
  useLevelViewStore.setState({ modeByGame: {}, optimisation: 3, stats: false });
});

describe('useLevelViewStore (Phase 136 Themes E and G)', () => {
  it('opens a game on Floorplan and keeps each game its own mode', () => {
    const s = useLevelViewStore.getState();
    expect(levelViewMode(s, 'g1')).toBe('plan');
    s.setMode('g1', '3d');
    expect(levelViewMode(useLevelViewStore.getState(), 'g1')).toBe('3d');
    expect(levelViewMode(useLevelViewStore.getState(), 'g2')).toBe('plan');
  });

  it('clamps the slider to 1..5 and persists mode, slider and readout', () => {
    const s = useLevelViewStore.getState();
    s.setOptimisation(7);
    expect(useLevelViewStore.getState().optimisation).toBe(5);
    s.setOptimisation(1);
    s.toggleStats();
    s.setMode('g1', '3d');
    const saved = JSON.parse(localStorage.getItem(KEY)!);
    expect(saved.state).toEqual({ modeByGame: { g1: '3d' }, optimisation: 1, stats: true });
  });

  it('a corrupt payload falls back to the defaults', async () => {
    localStorage.setItem(KEY, JSON.stringify({ state: { modeByGame: { g1: 'sideways', g2: '3d' }, optimisation: 'max', stats: 'yes' }, version: 1 }));
    await useLevelViewStore.persist.rehydrate();
    const s = useLevelViewStore.getState();
    expect(s.modeByGame).toEqual({ g2: '3d' });
    expect(s.optimisation).toBe(3);
    expect(s.stats).toBe(false);
  });
});
