import { describe, expect, it } from 'vitest';

import { COMMAND_IDS, COMMANDS, DEFAULT_KEYMAP, SUITE_COMMANDS } from './keybindings';

describe('SUITE_COMMANDS (Phase 123 Theme D)', () => {
  it('names only declared commands, in COMMANDS order, each once', () => {
    for (const id of SUITE_COMMANDS) expect(COMMAND_IDS).toContain(id);
    expect(new Set(SUITE_COMMANDS).size).toBe(SUITE_COMMANDS.length);
    const order = SUITE_COMMANDS.map((id) => COMMAND_IDS.indexOf(id));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('carries no repo-bound command', () => {
    for (const id of SUITE_COMMANDS) {
      expect(id.startsWith('sync.')).toBe(false);
      expect(id.startsWith('repo.')).toBe(false);
    }
    expect(SUITE_COMMANDS).not.toContain('view.graph');
  });

  it('covers all six terminal commands and view.settings', () => {
    expect(SUITE_COMMANDS.filter((id) => id.startsWith('terminal.'))).toHaveLength(6);
    expect(SUITE_COMMANDS).toContain('view.settings');
  });
});

describe('view.settings', () => {
  it('sits on Mod+, and no other command does', () => {
    expect(COMMANDS.find((c) => c.id === 'view.settings')).toMatchObject({ chord: 'Mod+,', scope: 'app' });
    expect(DEFAULT_KEYMAP.filter((b) => b.chord === 'Mod+,').map((b) => b.command)).toEqual([
      'view.settings',
    ]);
  });
});
