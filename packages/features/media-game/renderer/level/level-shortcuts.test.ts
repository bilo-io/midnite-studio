import { describe, expect, it } from 'vitest';

import { formatChord, LEVEL_SHORTCUTS, matchShortcut, shortcutApplies, type ShortcutContext } from './level-shortcuts';

const key = (k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods,
});
const plan2d: ShortcutContext = { view: 'plan', dimension: '2d', mac: false };
const plan3d: ShortcutContext = { view: 'plan', dimension: '3d', mac: false };
const view3d: ShortcutContext = { view: '3d', dimension: '3d', mac: false };

describe('LEVEL_SHORTCUTS (Phase 137 Theme J)', () => {
  it('J1 every pre-phase key has a row', () => {
    const chords = new Set(LEVEL_SHORTCUTS.map((r) => r.chord.toUpperCase()));
    for (const c of ['B', 'E', 'R', 'I', 'O', 'V', 'P', 'Y', 'MOD+Z', 'MOD+SHIFT+Z', 'DELETE', 'BACKSPACE', 'ENTER', 'ESCAPE', 'W', 'F']) {
      expect(chords.has(c), c).toBe(true);
    }
  });

  it('J2 no two rows live in the same view and dimension share a chord', () => {
    for (const view of ['plan', '3d'] as const) {
      for (const dimension of ['2d', '3d'] as const) {
        const seen = new Set<string>();
        for (const row of LEVEL_SHORTCUTS.filter((r) => shortcutApplies(r, { view, dimension }))) {
          const c = row.chord.toLowerCase();
          expect(seen.has(c), `${view}/${dimension} ${c}`).toBe(false);
          seen.add(c);
        }
      }
    }
  });

  it('J3 Cmd+D (mac) and Ctrl+D map to edit.duplicate', () => {
    expect(matchShortcut(key('d', { metaKey: true }), { ...plan2d, mac: true })).toBe('edit.duplicate');
    expect(matchShortcut(key('d', { ctrlKey: true }), plan2d)).toBe('edit.duplicate');
  });

  it('maps undo, redo and the plain keys per view and dimension', () => {
    expect(matchShortcut(key('z', { ctrlKey: true }), plan2d)).toBe('edit.undo');
    expect(matchShortcut(key('Z', { ctrlKey: true, shiftKey: true }), plan2d)).toBe('edit.redo');
    expect(matchShortcut(key('r'), plan2d)).toBe('tool.rect');
    expect(matchShortcut(key('r'), plan3d)).toBe('tool.volume');
    expect(matchShortcut(key('r'), view3d)).toBe('gizmo.scale');
    expect(matchShortcut(key('n'), plan3d)).toBe('tool.spawner');
    expect(matchShortcut(key('n'), view3d)).toBe('tool.spawner');
    expect(matchShortcut(key('n'), plan2d)).toBeNull();
    expect(matchShortcut(key('b'), plan3d)).toBeNull();
    expect(matchShortcut(key('ArrowLeft', { shiftKey: true }), plan2d)).toBe('select.nudge');
    expect(matchShortcut(key('Backspace'), plan2d)).toBe('edit.delete');
    expect(matchShortcut(key('?', { shiftKey: true }), plan2d)).toBe('help.shortcuts');
    expect(matchShortcut(key('v', { altKey: true }), plan2d)).toBeNull();
  });

  it('formats chords per platform', () => {
    expect(formatChord('Mod+D', true)).toBe('⌘D');
    expect(formatChord('Mod+Shift+Z', true)).toBe('⌘⇧Z');
    expect(formatChord('Mod+D', false)).toBe('Ctrl+D');
  });

  it('Phase 140 B: F5 plays, Shift+F5 stops, and neither shadows the other', () => {
    expect(matchShortcut(key('F5'), plan2d)).toBe('play.here');
    expect(matchShortcut(key('F5', { shiftKey: true }), plan2d)).toBe('play.stop');
    expect(matchShortcut(key('F5'), view3d)).toBe('play.here');
    expect(matchShortcut(key('F5', { metaKey: true }), plan2d)).toBeNull();
  });
});
