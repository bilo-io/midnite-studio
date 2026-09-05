import { beforeEach, describe, expect, it } from 'vitest';

import { useAppearanceStore } from '../../store/appearance-store';
import { usePaletteStore } from './palette-store';

/**
 * Phase 64 Theme B — `palette-store.ts` persists into `appearance-store.ts`'s
 * own `midnite.settings` key (Decision 10) via the shared merge-on-write
 * storage, rather than a new key of its own.
 */
describe('palette-store persistence (Phase 64 Theme B)', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset the singleton store's in-memory state between tests — several
    // tests below mutate it directly (bypassing persist), and that must not
    // leak into the next test's expectations.
    usePaletteStore.setState({
      activePaletteId: 'github-dark',
      terminalPaletteOverride: null,
      editorPaletteOverride: null,
      userPalettes: [],
    });
  });

  it('a real pre-Phase-64 profile (no palette fields at all) is seeded with defaults', () => {
    const migrate = usePaletteStore.persist.getOptions().migrate;
    // A version-1 `midnite.settings` blob predates palette-store entirely —
    // it holds only appearance-store's own fields.
    const migrated = migrate?.({ accent: 'violet', motion: 'full' }, 1) as {
      activePaletteId: string;
      terminalPaletteOverride: string | null;
      editorPaletteOverride: string | null;
      userPalettes: unknown[];
    };
    expect(migrated.activePaletteId).toBe('github-dark');
    expect(migrated.terminalPaletteOverride).toBeNull();
    expect(migrated.editorPaletteOverride).toBeNull();
    expect(migrated.userPalettes).toEqual([]);
  });

  it('leaves an already-migrated (version 2) payload alone', () => {
    const migrate = usePaletteStore.persist.getOptions().migrate;
    const payload = {
      activePaletteId: 'monokai',
      terminalPaletteOverride: 'github-dark',
      editorPaletteOverride: null,
      userPalettes: [],
    };
    expect(migrate?.(payload, 2)).toEqual(payload);
  });

  it('shares midnite.settings with appearance-store without clobbering its fields', () => {
    // appearance-store persists first...
    useAppearanceStore.setState({ accent: 'emerald' });
    useAppearanceStore.persist.getOptions().storage?.setItem('midnite.settings', {
      state: useAppearanceStore.persist.getOptions().partialize?.(useAppearanceStore.getState()),
      version: 2,
    });
    // ...then palette-store persists — the shared storage must MERGE, not replace.
    usePaletteStore.setState({ activePaletteId: 'vscode-dark-plus' });
    usePaletteStore.persist.getOptions().storage?.setItem('midnite.settings', {
      state: usePaletteStore.persist.getOptions().partialize?.(usePaletteStore.getState()),
      version: 2,
    });

    const raw = JSON.parse(localStorage.getItem('midnite.settings') ?? '{}');
    expect(raw.state.accent).toBe('emerald');
    expect(raw.state.activePaletteId).toBe('vscode-dark-plus');
  });

  it('a real pre-upgrade localStorage blob (appearance only) round-trips through both stores', async () => {
    localStorage.setItem(
      'midnite.settings',
      JSON.stringify({ state: { accent: 'blue', motion: 'reduced' }, version: 1 }),
    );
    await useAppearanceStore.persist.rehydrate();
    await usePaletteStore.persist.rehydrate();

    expect(useAppearanceStore.getState().accent).toBe('blue');
    expect(usePaletteStore.getState().activePaletteId).toBe('github-dark');
    expect(usePaletteStore.getState().userPalettes).toEqual([]);
  });
});
