import { beforeEach, describe, expect, it } from 'vitest';

import type { CommandDescriptor } from '@midnite/studio-shared';

import { filterCommands, groupCommands, matchesQuery, parsePaletteQuery, usePaletteStore } from './palette-store';
import {
  bumpFrecency,
  evictLowestWeight,
  frecencyMultiplier,
  MAX_FRECENCY_ENTRIES,
  useFrecencyStore,
  type FrecencyMap,
} from '../services/palette/frecency-store';

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

/**
 * Phase 23 Theme D, reopened: the frecency nudge. Its own tiny persisted
 * slice (`services/palette/frecency-store.ts`), tested here alongside the
 * rest of the palette suites per the phase doc.
 */
describe('frecency', () => {
  beforeEach(() => {
    useFrecencyStore.setState({ entries: {} });
  });

  it('a run bumps the item', () => {
    const now = 1_000_000;
    useFrecencyStore.setState({ entries: bumpFrecency({}, 'command:sync.pull', now) });
    expect(useFrecencyStore.getState().entries['command:sync.pull']).toEqual({
      count: 1,
      lastAt: now,
    });

    useFrecencyStore.setState({
      entries: bumpFrecency(useFrecencyStore.getState().entries, 'command:sync.pull', now + 1),
    });
    expect(useFrecencyStore.getState().entries['command:sync.pull']).toEqual({
      count: 2,
      lastAt: now + 1,
    });
  });

  it('the cap evicts the lowest count * recencyDecay entry once over 50 keys', () => {
    const now = 1_000_000;
    let entries: FrecencyMap = {};
    for (let i = 0; i < MAX_FRECENCY_ENTRIES; i++) {
      // Ascending count, so index 0 is deliberately the lowest-weight entry.
      entries[`cmd-${i}`] = { count: i + 1, lastAt: now };
    }
    expect(Object.keys(entries)).toHaveLength(MAX_FRECENCY_ENTRIES);

    entries = bumpFrecency(entries, 'a-brand-new-command', now);

    expect(Object.keys(entries)).toHaveLength(MAX_FRECENCY_ENTRIES);
    expect(entries['cmd-0']).toBeUndefined();
    expect(entries['a-brand-new-command']).toBeDefined();
    // The rest of the low end survives — only the single lowest was evicted.
    expect(entries['cmd-1']).toBeDefined();
  });

  it('evictLowestWeight is a no-op at or under the cap', () => {
    const entries: FrecencyMap = { a: { count: 1, lastAt: 0 }, b: { count: 2, lastAt: 0 } };
    expect(evictLowestWeight(entries)).toBe(entries);
  });

  it("a never-run item's ordering is unchanged relative to its peers", () => {
    const entries: FrecencyMap = { 'command:sync.pull': { count: 5, lastAt: Date.now() } };
    // Neither of these two ever ran — both must get the same neutral
    // multiplier, so the nudge cannot reorder them relative to each other.
    expect(frecencyMultiplier(entries, 'command:sync.push')).toBe(1);
    expect(frecencyMultiplier(entries, 'view:graph')).toBe(1);
    expect(frecencyMultiplier(entries, 'command:sync.push')).toBe(
      frecencyMultiplier(entries, 'view:graph'),
    );
  });

  it('bounds the multiplier at 1.25 even for a heavily-run, just-fired item', () => {
    const now = Date.now();
    const entries: FrecencyMap = { hot: { count: 1000, lastAt: now } };
    expect(frecencyMultiplier(entries, 'hot', now)).toBeLessThanOrEqual(1.25);
    expect(frecencyMultiplier(entries, 'hot', now)).toBeGreaterThan(1);
  });

  it('decays toward the neutral multiplier as lastAt recedes', () => {
    const now = Date.now();
    const entries: FrecencyMap = { stale: { count: 5, lastAt: now - 1000 * 60 * 60 * 24 * 60 } };
    const multiplier = frecencyMultiplier(entries, 'stale', now);
    expect(multiplier).toBeGreaterThanOrEqual(1);
    expect(multiplier).toBeLessThan(frecencyMultiplier({ stale: { count: 5, lastAt: now } }, 'stale', now));
  });
});
