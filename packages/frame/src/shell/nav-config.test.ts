// vitest/jsdom: pure functions — no browser capability needed.
import { LuShield } from 'react-icons/lu';
import { describe, expect, it } from 'vitest';

import { displayChord, navChordFor, navConfigProblems, navViewForPath, pathForNavView } from './nav-config';

describe('nav config', () => {
  it('accepts a sound nav', () => {
    expect(navConfigProblems({ views: [{ id: 'chats', label: 'Chats', icon: LuShield, command: 'view.chats' }] })).toEqual([]);
  });

  it('names every problem: empty, duplicate, settings row, unknown command', () => {
    expect(navConfigProblems({ views: [] })).toEqual(['nav has no views']);
    const problems = navConfigProblems({
      views: [
        { id: 'a', label: 'A', icon: LuShield },
        { id: 'a', label: 'A', icon: LuShield },
        { id: 'settings', label: 'Settings', icon: LuShield },
        { id: 'b', label: 'B', icon: LuShield, command: 'nope' as never },
      ],
    });
    expect(problems).toHaveLength(3);
  });

  it('round-trips a view through its rail path', () => {
    expect(pathForNavView('sensors')).toBe('/sensors');
    expect(navViewForPath(pathForNavView('sensors'))).toBe('sensors');
  });

  it('renders a chord per platform', () => {
    expect(displayChord('Mod+Shift+g', true)).toBe('⌘⇧G');
    expect(displayChord('Mod+Shift+g', false)).toBe('Ctrl+Shift+G');
  });

  it('derives a view chord from its command, and none without one', () => {
    const chordFor = navChordFor(
      {
        views: [
          { id: 'graph', label: 'Graph', icon: LuShield, command: 'view.graph' },
          { id: 'chats', label: 'Chats', icon: LuShield, command: 'view.chats' },
          { id: 'plain', label: 'Plain', icon: LuShield },
        ],
      },
      true,
    );
    expect(chordFor('graph')).toBe('⌘⇧G');
    expect(chordFor('chats')).toBeUndefined();
    expect(chordFor('plain')).toBeUndefined();
  });
});
