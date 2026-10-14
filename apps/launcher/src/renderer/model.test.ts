import { describe, expect, it } from 'vitest';

import { APPS } from '../common/catalog';
import { appNumber, filterCounts, matchesQuery, visibleSections } from './model';

const app = (id: string) => APPS.find((a) => a.id === id)!;

describe('launcher model', () => {
  it('numbers apps in suite order from 01', () => {
    expect(appNumber(APPS[0]!)).toBe('01');
    expect(appNumber(app('studio'))).toBe(String(APPS.length).padStart(2, '0'));
  });

  it('searches names, taglines and features, every word', () => {
    expect(matchesQuery(app('gamer'), 'terrain')).toBe(true);
    expect(matchesQuery(app('coder'), 'midnite db')).toBe(true);
    expect(matchesQuery(app('coder'), 'terrain')).toBe(false);
  });

  it('counts and groups by section, dropping empty ones', () => {
    expect(filterCounts(() => 'not-installed')).toEqual({ all: 7, installed: 0, updates: 0, 'not-installed': 7 });
    expect(filterCounts(() => 'update')).toEqual({ all: 7, installed: 7, updates: 7, 'not-installed': 0 });

    const all = visibleSections({ filter: 'all', query: '', sort: 'suite', stateOf: () => 'installed' });
    expect(all.map((g) => g.section)).toEqual(['suite', 'utilities', 'all-in-one']);

    const found = visibleSections({ filter: 'all', query: 'sprites', sort: 'suite', stateOf: () => 'installed' });
    expect(found).toEqual([{ section: 'suite', apps: [app('gamer')] }]);

    expect(visibleSections({ filter: 'updates', query: '', sort: 'suite', stateOf: () => 'installed' })).toEqual([]);

    const byName = visibleSections({ filter: 'all', query: '', sort: 'name', stateOf: () => 'installed' });
    expect(byName[0]!.apps.map((a) => a.name)).toEqual(['Agents', 'Coder', 'Creator', 'Gamer']);
  });
});
