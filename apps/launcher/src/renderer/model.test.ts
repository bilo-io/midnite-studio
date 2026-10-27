import { describe, expect, it } from 'vitest';

import { APPS } from '../common/catalog';
import { appNumber, filterCounts, matchesQuery, removableApps, removalSummary, visibleSections } from './model';

const app = (id: string) => APPS.find((a) => a.id === id)!;

describe('launcher model', () => {
  it('numbers apps in suite order from 01, Studio first', () => {
    expect(appNumber(app('studio'))).toBe('01');
    expect(appNumber(APPS.at(-1)!)).toBe(String(APPS.length).padStart(2, '0'));
  });

  it('searches names, taglines and features, every word', () => {
    expect(matchesQuery(app('gamer'), 'terrain')).toBe(true);
    expect(matchesQuery(app('coder'), 'midnite db')).toBe(true);
    expect(matchesQuery(app('coder'), 'terrain')).toBe(false);
  });

  it('counts and groups by section, dropping empty ones', () => {
    const n = APPS.length;
    expect(filterCounts(() => 'not-installed')).toEqual({ all: n, installed: 0, updates: 0, 'not-installed': n });
    expect(filterCounts(() => 'update')).toEqual({ all: n, installed: n, updates: n, 'not-installed': 0 });

    const all = visibleSections({ filter: 'all', query: '', sort: 'suite', stateOf: () => 'installed' });
    expect(all.map((g) => g.section)).toEqual(['suite', 'utilities']);
    expect(all[0]!.apps[0]!.id).toBe('studio');

    const found = visibleSections({ filter: 'all', query: 'sprites', sort: 'suite', stateOf: () => 'installed' });
    expect(found).toEqual([{ section: 'suite', apps: [app('gamer')] }]);

    expect(visibleSections({ filter: 'updates', query: '', sort: 'suite', stateOf: () => 'installed' })).toEqual([]);

    const byName = visibleSections({ filter: 'all', query: '', sort: 'name', stateOf: () => 'installed' });
    expect(byName.find((g) => g.section === 'suite')!.apps.map((a) => a.name)).toEqual([
      'Accountant',
      'Agents',
      'Browser',
      'Coder',
      'Creator',
      'Gamer',
      'Health',
      'Media',
      'Mind',
      'Money',
      'Science',
      'Simulator',
      'Startup',
      'Studio',
      'Vanguard',
    ]);
    expect(byName.find((g) => g.section === 'utilities')!.apps.map((a) => a.name)).toEqual([
      'Capture',
      'Cleaner',
      'Monitor',
      'Vault',
    ]);
  });

  it('removes Studio and own-bundle apps, never a Studio-hosted tile, Studio last', () => {
    const removable = removableApps((a) =>
      a.id === 'studio'
        ? { state: 'update', source: 'studio' }
        : a.id === 'cleaner'
          ? { state: 'installed', source: 'bundle' }
          : a.id === 'vault'
            ? { state: 'not-installed', source: 'bundle' }
            : { state: 'installed', source: 'studio' },
    );
    expect(removable.map((a) => a.id)).toEqual(['cleaner', 'studio']);
    expect(removableApps(() => ({ state: 'not-installed', source: 'bundle' }))).toEqual([]);
  });

  it('summarises a bulk removal, naming each skipped app and why', () => {
    expect(removalSummary([{ app: app('studio'), result: { ok: true } }])).toEqual({ message: 'Moved 1 app to the Trash.', tone: 'info' });
    const partial = removalSummary([
      { app: app('cleaner'), result: { ok: true } },
      { app: app('studio'), result: { ok: false, message: 'Midnite Studio is running — quit it first.' } },
    ]);
    expect(partial.tone).toBe('error');
    expect(partial.message).toBe(
      'Moved 1 of 2 apps to the Trash. Skipped — Midnite Studio: Midnite Studio is running — quit it first.',
    );
  });
});
