import { addCustomOption, createBlankCustomLoop, updateCustomOption } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { mergeCustomLoops, migrateCustomLoops, omitKey } from './migrate-custom-loops';
import { useUiStore } from './ui-store';

const reset = () =>
  useUiStore.setState({
    activeFabTab: 'guard',
    customLoops: [],
    customLoopEditing: null,
    customLoopFresh: null,
    loopModifierChecks: {},
    loopModifierDefaults: {},
    loopEnabled: {},
    loopModels: {},
    fabSessions: {},
  });

describe('v35 -> v36 migration (custom loops)', () => {
  it('seeds an empty list and keeps one a test profile already holds', () => {
    expect(migrateCustomLoops({}).customLoops).toEqual([]);
    const held = [createBlankCustomLoop()];
    expect(migrateCustomLoops({ customLoops: held }).customLoops).toBe(held);
  });

  it('runs from the real store migrate', () => {
    const migrated = useUiStore.persist.getOptions().migrate?.({ loopEnabled: {} }, 35) as Record<string, unknown>;
    expect(migrated.customLoops).toEqual([]);
    expect(useUiStore.persist.getOptions().version).toBe(38);
  });

  it('a persisted v35 blob rehydrates with no custom loops', () => {
    localStorage.setItem('midnite-studio.ui', JSON.stringify({ state: { activeFabTab: 'medic' }, version: 35 }));
    void useUiStore.persist.rehydrate();
    expect(useUiStore.getState().customLoops).toEqual([]);
    expect(useUiStore.getState().activeFabTab).toBe('medic');
  });
});

describe('mergeCustomLoops', () => {
  const current = { customLoops: [], activeFabTab: 'guard' };

  it('keeps valid loops and drops broken rows', () => {
    const loop = createBlankCustomLoop();
    const out = mergeCustomLoops({ customLoops: [loop, { id: 'custom-x' }] }, current);
    expect(out.customLoops.map((l) => l.id)).toEqual([loop.id]);
    expect(out.activeFabTab).toBeUndefined();
  });

  it('pulls an active tab naming a vanished custom loop back onto Guard', () => {
    expect(mergeCustomLoops({ customLoops: [], activeFabTab: 'custom-gone' }, current).activeFabTab).toBe('guard');
    const loop = createBlankCustomLoop();
    expect(mergeCustomLoops({ customLoops: [loop], activeFabTab: loop.id }, current).activeFabTab).toBeUndefined();
  });

  it('omitKey returns the same object when there is nothing to drop', () => {
    const record = { a: 1 };
    expect(omitKey(record, 'b')).toBe(record);
    expect(omitKey(record, 'a')).toEqual({});
  });
});

describe('custom loop store actions', () => {
  beforeEach(reset);

  it('createCustomLoop makes a blank loop, selects it and opens Edit with Start from', () => {
    const id = useUiStore.getState().createCustomLoop();
    const state = useUiStore.getState();
    expect(state.customLoops.map((l) => l.id)).toEqual([id]);
    expect(state.customLoops[0]!.label).toBe('New loop');
    expect(state.activeFabTab).toBe(id);
    expect(state.customLoopEditing).toBe(id);
    expect(state.customLoopFresh).toBe(id);
  });

  it('startCustomLoopFrom duplicates a built-in with its current base prompt, keeping the id', () => {
    const id = useUiStore.getState().createCustomLoop();
    useUiStore.setState((s) => ({
      agentSkills: { ...s.agentSkills, loopGuard: '/loop /my-guard' },
      loopModifierChecks: { [id]: { stale: true } },
    }));
    useUiStore.getState().startCustomLoopFrom(id, 'guard');
    const loop = useUiStore.getState().customLoops[0]!;
    expect(loop.id).toBe(id);
    expect(loop.label).toBe('Guard copy');
    expect(loop.fallbackPrompt).toBe('/loop /my-guard');
    expect(loop.modifiers.some((m) => m.id === 'secret-scan')).toBe(true);
    // Still fresh — the author may pick a different start.
    expect(useUiStore.getState().customLoopFresh).toBe(id);
    expect(useUiStore.getState().loopModifierChecks[id]).toBeUndefined();

    useUiStore.getState().startCustomLoopFrom(id, null);
    expect(useUiStore.getState().customLoops[0]!.label).toBe('New loop');
  });

  it('updateCustomLoop edits in place, keeps the id and retires Start from', () => {
    const id = useUiStore.getState().createCustomLoop();
    useUiStore.getState().updateCustomLoop(id, (loop) => {
      const withOption = addCustomOption(loop, loop.sections[0]!.id);
      const option = withOption.modifiers.find((m) => m.section !== undefined)!;
      return {
        ...updateCustomOption(withOption, option.id, { label: 'Review', promptFragment: 'Review PRs.' }),
        label: 'Reviewer',
        hue: 10,
        id: 'custom-hijack',
      };
    });
    const loop = useUiStore.getState().customLoops[0]!;
    expect(loop.id).toBe(id);
    expect(loop.label).toBe('Reviewer');
    expect(loop.hue).toBe(10);
    expect(loop.modifiers.find((m) => m.label === 'Review')?.promptFragment).toBe('Review PRs.');
    expect(useUiStore.getState().customLoopFresh).toBeNull();
  });

  it('leaving Edit mode settles a fresh loop', () => {
    const id = useUiStore.getState().createCustomLoop();
    useUiStore.getState().setCustomLoopEditing(null);
    expect(useUiStore.getState().customLoopEditing).toBeNull();
    expect(useUiStore.getState().customLoopFresh).toBeNull();
    useUiStore.getState().setCustomLoopEditing(id);
    expect(useUiStore.getState().customLoopFresh).toBeNull();
  });

  it('deleteCustomLoop removes the loop and its per-loop records, falling back to the left tab', () => {
    const first = useUiStore.getState().createCustomLoop();
    const second = useUiStore.getState().createCustomLoop();
    useUiStore.setState({
      loopEnabled: { [second]: false, guard: false },
      loopModels: { [second]: 'opus-5' },
      fabSessions: { [second]: 'session-1' },
    });
    useUiStore.getState().deleteCustomLoop(second);
    const state = useUiStore.getState();
    expect(state.customLoops.map((l) => l.id)).toEqual([first]);
    expect(state.activeFabTab).toBe(first);
    expect(state.loopEnabled).toEqual({ guard: false });
    expect(state.loopModels[second]).toBeUndefined();
    expect(state.fabSessions[second]).toBeUndefined();
    expect(state.customLoopEditing).toBeNull();

    useUiStore.getState().deleteCustomLoop(first);
    expect(useUiStore.getState().activeFabTab).toBe('overhaul');
  });

  it('persists custom loops in the ui blob', () => {
    useUiStore.getState().createCustomLoop();
    const saved = JSON.parse(localStorage.getItem('midnite-studio.ui') ?? '{}') as {
      state: { customLoops?: unknown[]; customLoopEditing?: unknown };
    };
    expect(saved.state.customLoops).toHaveLength(1);
    expect(saved.state.customLoopEditing).toBeUndefined();
  });
});
