// vitest/jsdom: pure functions — no browser capability needed.
import { LuShield } from 'react-icons/lu';
import { describe, expect, it } from 'vitest';

import { displayChord, navChordFor, navConfigProblems, navFromGroups, navFromModules, navViewForPath, pathForNavView } from './nav-config';

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

describe('nav groups (Phase 124 Theme E)', () => {
  const view = (id: string) => ({ id, label: id, icon: (() => null) as never });
  it('navFromGroups flattens the groups into views and is sound', () => {
    const nav = navFromGroups([
      { id: 'agents', label: 'Agents', icon: (() => null) as never, views: [view('chats')] },
      { id: 'coder', label: 'Coder', icon: (() => null) as never, views: [view('reviews'), view('tests')] },
    ]);
    expect(nav.views.map((v) => v.id)).toEqual(['chats', 'reviews', 'tests']);
    expect(navConfigProblems(nav)).toEqual([]);
  });

  it('navFromModules keeps the host row order and skips modules with no group yet', () => {
    const g = (id: string) => ({ id, label: id, icon: (() => null) as never, views: [view(id + '-home')] });
    const nav = navFromModules(['agents', 'coder', 'creator'], { creator: g('creator'), agents: g('agents') });
    expect(nav.groups?.map((x) => x.id)).toEqual(['agents', 'creator']);
    expect(nav.views.map((v) => v.id)).toEqual(['agents-home', 'creator-home']);
    expect(navConfigProblems(nav)).toEqual([]);
  });

  it('flags a views list that drifted from its groups, and an empty or duplicate group', () => {
    const group = { id: 'a', label: 'A', icon: (() => null) as never, views: [view('x')] };
    expect(navConfigProblems({ views: [view('y')], groups: [group] })).toContain('nav.views is not the flat concatenation of nav.groups');
    expect(navConfigProblems({ views: [view('x')], groups: [group, { ...group, views: [] }] })).toEqual(
      expect.arrayContaining(['duplicate group id "a"', 'group "a" has no views']),
    );
  });
});
