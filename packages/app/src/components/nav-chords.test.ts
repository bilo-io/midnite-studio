import { describe, expect, it } from 'vitest';

import { COMMANDS, DEFAULT_KEYMAP } from '@midnite/studio-shared';

import { VIEW_COMMAND, navChord } from './nav-chords';
import { VIEW_ICON } from './nav-icons';

/**
 * The rail's chord map, checked against the registry it defers to.
 *
 * Nothing here asserts a chord literal except the two the task actually
 * changed — the point of the map is that a rebound command moves the rail's
 * tooltip with it, and a test restating every chord would be the third copy
 * the map exists to prevent.
 */
describe('VIEW_COMMAND', () => {
  it('names only real commands, each of which actually has a chord', () => {
    for (const [view, id] of Object.entries(VIEW_COMMAND)) {
      const command = COMMANDS.find((c) => c.id === id);
      expect(command, `${view} → ${id}`).toBeDefined();
      // A rail row whose command is declared-but-unbound would render an empty
      // bubble — the exact failure `view.refresh` and `sync.fetch` would cause
      // if either were ever wired in here.
      expect(DEFAULT_KEYMAP.find((b) => b.command === id), `${view} → ${id}`).toBeDefined();
    }
  });

  it('keys only views that exist', () => {
    for (const view of Object.keys(VIEW_COMMAND)) {
      expect(VIEW_ICON, view).toHaveProperty(view);
    }
  });
});

describe('navChord', () => {
  it('renders the platform modifier, never the keymap’s `Mod`', () => {
    for (const view of Object.keys(VIEW_COMMAND)) {
      const chord = navChord(view as keyof typeof VIEW_COMMAND);
      expect(chord, view).toBeTruthy();
      expect(chord, view).not.toContain('Mod');
    }
  });

  it('is undefined for a view with no chord, so the rail renders no bubble', () => {
    // Three of the rail's own rows, one per section, plus the pinned one.
    expect(navChord('dashboard')).toBeUndefined();
    expect(navChord('tests')).toBeUndefined();
    expect(navChord('history')).toBeUndefined();
    expect(navChord('councils')).toBeUndefined();
  });
});
