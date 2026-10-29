import type { ComponentType } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultSuitePrefs } from '@midnite/studio-shared';

import { useAppearanceStore } from '../prefs/appearance-store';
import { resetSuitePrefsStorage } from '../prefs/suite-prefs-storage';
import { ChordsPage } from './chords-page';
import {
  SUITE_SETTINGS_PAGES,
  appSettingsPages,
  settingsPageProblems,
  suiteSettingsPages,
  type SuiteSettingsPageId,
} from './settings-pages';
import { SettingsView } from './settings-view';

/**
 * Phase 123 Theme L.3 / L.4 — the frame's settings view: the five suite pages plus the chords page for
 * any app, then that app's own pages; suite pages write suite-prefs, app pages write their own store.
 * jsdom is enough: nothing here needs real layout.
 */
const stub = (name: string) => () => <p>{name} page</p>;
const suiteComponents = Object.fromEntries(
  SUITE_SETTINGS_PAGES.map((p) => [p.id, stub(p.label)]),
) as unknown as Record<SuiteSettingsPageId, ComponentType>;

/** Vanguard's manifest lists one app page of its own. */
const VANGUARD_SETTINGS = ['vanguard'] as const;
const registry = {
  vanguard: {
    id: 'vanguard' as const,
    label: 'Vanguard',
    group: 'system' as const,
    Page: stub('Vanguard'),
  },
};

const pages = () => [
  ...suiteSettingsPages(suiteComponents, () => <ChordsPage mac />),
  ...appSettingsPages(VANGUARD_SETTINGS, registry),
];

describe('SettingsView in the frame', () => {
  afterEach(cleanup);

  it("renders Vanguard's settings: the five suite pages, the chords page and its own page", () => {
    render(<SettingsView pages={pages()} />);
    const nav = screen.getByRole('navigation', { name: 'Settings pages' });
    for (const label of [
      'Appearance',
      'Privacy',
      'Terminal',
      'Companion',
      'Monitor & Diagnostics',
      'Keyboard shortcuts',
      'Vanguard',
    ]) {
      expect(nav.querySelector(`button[title="${label}"]`), label).not.toBeNull();
    }
    expect(nav.querySelectorAll('li')).toHaveLength(7);
  });

  it('lists view.settings as ⌘, on the chords page', () => {
    render(<SettingsView pages={pages()} />);
    fireEvent.click(screen.getByTitle('Keyboard shortcuts'));
    const row = screen.getByText('Open Settings').closest('tr');
    expect(row?.textContent).toContain('⌘,');
  });

  it('switches page and folds a group, controlled or not', () => {
    render(<SettingsView pages={pages()} />);
    expect(screen.getByText('Appearance page')).not.toBeNull();
    fireEvent.click(screen.getByTitle('Vanguard'));
    expect(screen.getByText('Vanguard page')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'System & Maintenance' }));
    expect(
      screen.getByRole('button', { name: 'System & Maintenance' }).getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('flags a manifest page with no registration, a duplicate or a suite page', () => {
    expect(settingsPageProblems(VANGUARD_SETTINGS, registry)).toEqual([]);
    expect(settingsPageProblems(['cli'], registry)).toHaveLength(1);
    expect(settingsPageProblems(['vanguard', 'vanguard'], registry)).toHaveLength(1);
    expect(settingsPageProblems(['appearance'], { appearance: 1 })).toHaveLength(1);
  });
});

describe('which store each page writes (L.4)', () => {
  const set = vi.fn(async (req: { key: string; value: unknown }) => ({
    ok: true as const,
    snapshot: {
      prefs: { ...defaultSuitePrefs(), [req.key]: req.value },
      stored: [req.key] as never,
    },
  }));

  beforeEach(() => {
    localStorage.clear();
    resetSuitePrefsStorage();
    set.mockClear();
    window.midniteStudio = {
      suitePrefs: {
        get: async () => ({ prefs: defaultSuitePrefs(), stored: [] }),
        set,
        onChanged: () => () => undefined,
      },
    } as never;
  });
  afterEach(() => {
    cleanup();
    delete (window as { midniteStudio?: unknown }).midniteStudio;
  });

  const SuiteAppearance = () => (
    <button onClick={() => useAppearanceStore.getState().setAccent('rose')}>pick rose</button>
  );
  const AppOwn = () => (
    <button onClick={() => localStorage.setItem('app.own', '1')}>save own</button>
  );

  it('a suite page reaches suite-prefs and not localStorage; an app page the reverse', async () => {
    const all = [
      ...suiteSettingsPages({ ...suiteComponents, appearance: SuiteAppearance }, () => null),
      {
        id: 'vanguard' as const,
        label: 'Vanguard',
        group: 'system' as const,
        scope: 'app' as const,
        Page: AppOwn,
      },
    ];
    render(<SettingsView pages={all} />);
    fireEvent.click(screen.getByText('pick rose'));
    await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(1));
    expect(set.mock.calls[0]?.[0].key).toBe('appearance');
    expect(localStorage.getItem('midnite.settings')).toBeNull();

    fireEvent.click(screen.getByTitle('Vanguard'));
    fireEvent.click(screen.getByText('save own'));
    expect(localStorage.getItem('app.own')).toBe('1');
    expect(set).toHaveBeenCalledTimes(1);
  });
});
