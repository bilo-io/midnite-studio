import { beforeEach, describe, expect, it } from 'vitest';

import type { CommandDescriptor } from '@midnite/studio-shared';

import { filterCommands, groupCommands, matchesQuery, parsePaletteQuery, usePaletteStore } from './palette-store';

const command = (id: string, label: string, group: CommandDescriptor['group']): CommandDescriptor =>
  ({ id, label, group }) as CommandDescriptor;

describe('parsePaletteQuery', () => {
  it('reads each sigil as a mode switch', () => {
    expect(parsePaletteQuery('>fetch')).toEqual({ mode: 'commands', needle: 'fetch' });
    expect(parsePaletteQuery('@main')).toEqual({ mode: 'refs', needle: 'main' });
    expect(parsePaletteQuery(':settings')).toEqual({ mode: 'views', needle: 'settings' });
    expect(parsePaletteQuery('#')).toEqual({ mode: 'journal', needle: '' });
  });

  it('treats a bare string as an all-sources needle', () => {
    expect(parsePaletteQuery('fetch')).toEqual({ mode: 'all', needle: 'fetch' });
    expect(parsePaletteQuery('')).toEqual({ mode: 'all', needle: '' });
  });

  it('only reads a sigil in the first position — mid-string it is a needle character', () => {
    expect(parsePaletteQuery('a>b')).toEqual({ mode: 'all', needle: 'a>b' });
  });
});

describe('matchesQuery', () => {
  it('matches case-insensitively', () => {
    expect(matchesQuery('Toggle Terminal', 'term')).toBe(true);
    expect(matchesQuery('Toggle Terminal', 'TERM')).toBe(true);
    expect(matchesQuery('Toggle Terminal', 'xyz')).toBe(false);
  });

  it('matches everything for an empty needle', () => {
    expect(matchesQuery('anything', '')).toBe(true);
  });
});

describe('filterCommands', () => {
  const commands = [
    command('a', 'Fetch', 'sync'),
    command('b', 'Pull', 'sync'),
    command('c', 'Toggle Terminal', 'terminal'),
  ];

  it('filters by label substring', () => {
    expect(filterCommands(commands, 'term').map((c) => c.id)).toEqual(['c']);
  });

  it('returns everything for an empty needle', () => {
    expect(filterCommands(commands, '')).toHaveLength(3);
  });
});

describe('groupCommands', () => {
  it('groups in first-seen order, not alphabetised', () => {
    const commands = [
      command('a', 'Fetch', 'sync'),
      command('b', 'Toggle Terminal', 'terminal'),
      command('c', 'Pull', 'sync'),
    ];
    const groups = groupCommands(commands);
    expect(groups.map(([group]) => group)).toEqual(['sync', 'terminal']);
    expect(groups[0]?.[1].map((c) => c.id)).toEqual(['a', 'c']);
  });
});

describe('usePaletteStore', () => {
  const reset = () =>
    usePaletteStore.setState({ isOpen: false, mode: 'all', query: '', selectedIndex: 0 });

  beforeEach(reset);

  it('opens in the given mode and clears any prior query', () => {
    usePaletteStore.setState({ query: 'stale', selectedIndex: 3 });
    usePaletteStore.getState().open('files');
    const state = usePaletteStore.getState();
    expect(state).toMatchObject({ isOpen: true, mode: 'files', query: '', selectedIndex: 0 });
  });

  it('refuses to open while a modal dialog is up', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    try {
      usePaletteStore.getState().open();
      expect(usePaletteStore.getState().isOpen).toBe(false);
    } finally {
      dialog.remove();
    }
  });

  it('does not refuse to open over a context menu', () => {
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    try {
      usePaletteStore.getState().open();
      expect(usePaletteStore.getState().isOpen).toBe(true);
    } finally {
      menu.remove();
    }
  });

  it('switches mode on a typed sigil', () => {
    usePaletteStore.getState().setQuery('>fetch');
    expect(usePaletteStore.getState().mode).toBe('commands');
  });

  it('keeps a pinned mode sticky while typing a non-sigil query', () => {
    usePaletteStore.getState().open('files');
    usePaletteStore.getState().setQuery('read');
    expect(usePaletteStore.getState().mode).toBe('files');
  });

  it('resets to all-sources mode once the query is cleared', () => {
    usePaletteStore.getState().open('files');
    usePaletteStore.getState().setQuery('read');
    usePaletteStore.getState().setQuery('');
    expect(usePaletteStore.getState().mode).toBe('all');
  });
});
