import { beforeEach, describe, expect, it } from 'vitest';

import { useActivityPaletteStore } from './activity-palette-store';

describe('useActivityPaletteStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useActivityPaletteStore.setState({
      activePaletteId: 'brand',
      statusOverrides: {},
      agentStyle: 'gradient',
      shellStyle: 'metallic',
    });
  });

  it('defaults to Brand, no overrides, gradient agent and metallic shell', () => {
    const s = useActivityPaletteStore.getState();
    expect(s.activePaletteId).toBe('brand');
    expect(s.statusOverrides).toEqual({});
    expect(s.agentStyle).toBe('gradient');
    expect(s.shellStyle).toBe('metallic');
  });

  it('setStatusOverride adds an override for exactly that status', () => {
    const style = { color: { kind: 'solid' as const, color: '#123456' }, speed: 4, intensity: 0.5 };
    useActivityPaletteStore.getState().setStatusOverride('done', style);
    expect(useActivityPaletteStore.getState().statusOverrides.done).toEqual(style);
    expect(useActivityPaletteStore.getState().statusOverrides.failed).toBeUndefined();
  });

  it('resetStatusOverride removes only that status', () => {
    const style = { color: { kind: 'solid' as const, color: '#123456' }, speed: 4, intensity: 0.5 };
    useActivityPaletteStore.getState().setStatusOverride('done', style);
    useActivityPaletteStore.getState().setStatusOverride('failed', style);
    useActivityPaletteStore.getState().resetStatusOverride('done');
    expect(useActivityPaletteStore.getState().statusOverrides.done).toBeUndefined();
    expect(useActivityPaletteStore.getState().statusOverrides.failed).toEqual(style);
  });

  it('setAgentStyle / setShellStyle write independently', () => {
    useActivityPaletteStore.getState().setAgentStyle('metallic');
    useActivityPaletteStore.getState().setShellStyle('matchAgent');
    expect(useActivityPaletteStore.getState().agentStyle).toBe('metallic');
    expect(useActivityPaletteStore.getState().shellStyle).toBe('matchAgent');
  });

  it('resetAll restores every field to its shipped default', () => {
    const style = { color: { kind: 'solid' as const, color: '#123456' }, speed: 4, intensity: 0.5 };
    useActivityPaletteStore.getState().setActivePaletteId('rainbow');
    useActivityPaletteStore.getState().setStatusOverride('done', style);
    useActivityPaletteStore.getState().setAgentStyle('metallic');
    useActivityPaletteStore.getState().setShellStyle('gradient');

    useActivityPaletteStore.getState().resetAll();

    const s = useActivityPaletteStore.getState();
    expect(s.activePaletteId).toBe('brand');
    expect(s.statusOverrides).toEqual({});
    expect(s.agentStyle).toBe('gradient');
    expect(s.shellStyle).toBe('metallic');
  });

  it('a pre-Theme-B profile (no activity fields at all) migrates to defaults', () => {
    const migrate = useActivityPaletteStore.persist.getOptions().migrate;
    const migrated = migrate?.({ accent: 'violet', motion: 'full' }, 0) as {
      activePaletteId: string;
      statusOverrides: Record<string, unknown>;
      agentStyle: string;
      shellStyle: string;
    };
    expect(migrated.activePaletteId).toBe('brand');
    expect(migrated.statusOverrides).toEqual({});
    expect(migrated.agentStyle).toBe('gradient');
    expect(migrated.shellStyle).toBe('metallic');
  });

  it('persists under the shared midnite.settings key without clobbering sibling fields', () => {
    localStorage.setItem(
      'midnite.settings',
      JSON.stringify({ state: { accent: 'violet' }, version: 2 }),
    );
    useActivityPaletteStore.getState().setActivePaletteId('ocean');
    const raw = JSON.parse(localStorage.getItem('midnite.settings') ?? '{}');
    expect(raw.state.accent).toBe('violet');
    expect(raw.state.activePaletteId).toBe('ocean');
  });
});
