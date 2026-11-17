import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_LEVEL_SNAP } from '../level-snap';
import { levelViewMode, useLevelViewStore } from './level-view-store';

const KEY = 'midnite-studio.level-view';

afterEach(() => {
  localStorage.clear();
  useLevelViewStore.setState({ modeByGame: {}, optimisation: 3, stats: false, snap: DEFAULT_LEVEL_SNAP, pivot: 'pivot', space: 'world' });
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
    expect(saved.state).toEqual({ modeByGame: { g1: '3d' }, optimisation: 1, stats: true, snap: DEFAULT_LEVEL_SNAP, pivot: 'pivot', space: 'world' });
  });

  it('a corrupt payload falls back to the defaults', async () => {
    localStorage.setItem(KEY, JSON.stringify({ state: { modeByGame: { g1: 'sideways', g2: '3d' }, optimisation: 'max', stats: 'yes' }, version: 1 }));
    await useLevelViewStore.persist.rehydrate();
    const s = useLevelViewStore.getState();
    expect(s.modeByGame).toEqual({ g2: '3d' });
    expect(s.optimisation).toBe(3);
    expect(s.stats).toBe(false);
  });

  it('round-trips the snap settings, pivot and space (Phase 137 F, D)', async () => {
    const s = useLevelViewStore.getState();
    s.setSnap({ planStep: 0.5, angle: 45, surface: true });
    s.setPivot('centre');
    s.setSpace('local');
    const saved = JSON.parse(localStorage.getItem(KEY)!).state;
    expect(saved.snap).toEqual({ ...DEFAULT_LEVEL_SNAP, planStep: 0.5, angle: 45, surface: true });
    expect([saved.pivot, saved.space]).toEqual(['centre', 'local']);
    const raw = localStorage.getItem(KEY)!;
    useLevelViewStore.setState({ snap: DEFAULT_LEVEL_SNAP, pivot: 'pivot', space: 'world' });
    localStorage.setItem(KEY, raw);
    await useLevelViewStore.persist.rehydrate();
    expect(useLevelViewStore.getState().snap.angle).toBe(45);
    expect(useLevelViewStore.getState().pivot).toBe('centre');
  });

  it('a corrupt snap, pivot or space falls back field by field', async () => {
    localStorage.setItem(KEY, JSON.stringify({ state: { snap: { grid: 7, angle: 90, planStep: 3, enabled: 'x', surface: true }, pivot: 'x', space: 5 }, version: 1 }));
    await useLevelViewStore.persist.rehydrate();
    const s = useLevelViewStore.getState();
    expect(s.snap).toEqual({ ...DEFAULT_LEVEL_SNAP, angle: 90, surface: true });
    expect([s.pivot, s.space]).toEqual(['pivot', 'world']);
  });
});
