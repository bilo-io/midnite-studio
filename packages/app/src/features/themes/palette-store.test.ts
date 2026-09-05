import { beforeEach, describe, expect, it } from 'vitest';

import { useAppearanceStore } from '../../store/appearance-store';
import { usePaletteStore } from './palette-store';
import type { StudioPalette } from './theme-types';

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

  it('addUserPalette replaces (rather than duplicates) an existing palette with the same id', () => {
    // Phase 64 Theme F self-review: re-importing an edited VS Code theme file
    // reuses the same id (derived from the theme's `name`) — appending would
    // leave two entries sharing one id, a duplicate React key on the
    // Appearance page's preset-card list and an ambiguous lookup.
    const v1: StudioPalette = {
      id: 'vscode-my-theme',
      label: 'My Theme v1',
      appearance: 'dark',
      chrome: {},
      terminal: {} as StudioPalette['terminal'],
      editor: { base: 'vs-dark', rules: [], colors: {} },
      highlight: 'github-dark',
    };
    const v2: StudioPalette = { ...v1, label: 'My Theme v2' };

    usePaletteStore.getState().addUserPalette(v1);
    usePaletteStore.getState().addUserPalette(v2);

    const palettes = usePaletteStore.getState().userPalettes;
    expect(palettes).toHaveLength(1);
    expect(palettes[0]?.label).toBe('My Theme v2');
  });
});
