import { describe, expect, it } from 'vitest';

import { SETTINGS_PAGE_IDS, VIEW_IDS } from './domain/view';
import {
  ALWAYS_ON_FEATURE_PACKAGES,
  dependentsOf,
  disabledViews,
  FEATURE_TOGGLE_GROUPS,
  FEATURE_TOGGLE_IDS,
  featureForCommand,
  featureForView,
  featureToggle,
  isCommandOff,
  isFeatureToggleId,
  isSettingsPageOff,
  isViewOff,
  requirementsOf,
  setFeatureEnabled,
  StudioFeaturesPrefsSchema,
} from './feature-toggles';
import { COMMAND_IDS } from './keybindings';
import { resolveSuitePrefs } from './suite-prefs';

describe('feature toggles', () => {
  it('names only real views, settings pages, commands and groups', () => {
    const groups = FEATURE_TOGGLE_GROUPS.map((g) => g.id);
    for (const id of FEATURE_TOGGLE_IDS) {
      const spec = featureToggle(id);
      expect(groups).toContain(spec.group);
      for (const view of spec.views) expect(VIEW_IDS).toContain(view);
      for (const page of spec.settingsPages) expect(SETTINGS_PAGE_IDS).toContain(page);
      for (const command of spec.commands) expect(COMMAND_IDS).toContain(command);
      for (const req of spec.requires) expect(isFeatureToggleId(req)).toBe(true);
      expect(spec.description.length).toBeGreaterThan(0);
      for (const file of spec.data.files) expect(file.startsWith('/') || file.includes('..')).toBe(false);
    }
  });

  it('claims each view, page, command and package once', () => {
    for (const pick of [
      (id: (typeof FEATURE_TOGGLE_IDS)[number]) => featureToggle(id).views as readonly string[],
      (id: (typeof FEATURE_TOGGLE_IDS)[number]) => featureToggle(id).settingsPages as readonly string[],
      (id: (typeof FEATURE_TOGGLE_IDS)[number]) => featureToggle(id).commands as readonly string[],
      (id: (typeof FEATURE_TOGGLE_IDS)[number]) => featureToggle(id).packages,
    ]) {
      const all = FEATURE_TOGGLE_IDS.flatMap(pick);
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it('never claims Terminal, Settings or Accounts', () => {
    const views = FEATURE_TOGGLE_IDS.flatMap((id) => featureToggle(id).views);
    const pages = FEATURE_TOGGLE_IDS.flatMap((id) => featureToggle(id).settingsPages);
    const packages = FEATURE_TOGGLE_IDS.flatMap((id) => featureToggle(id).packages);
    expect(views).not.toContain('settings');
    expect(pages).not.toContain('accounts');
    expect(pages).not.toContain('terminal');
    expect(packages).not.toContain('terminal');
    expect(Object.keys(ALWAYS_ON_FEATURE_PACKAGES)).toContain('terminal');
    expect(featureForCommand('terminal.toggle')).toBeUndefined();
  });

  it('has no dependency cycle', () => {
    for (const id of FEATURE_TOGGLE_IDS) {
      const others = requirementsOf(id).slice(1);
      expect(others).not.toContain(id);
      for (const other of others) expect(requirementsOf(other)).not.toContain(id);
    }
  });

  it('switching off cascades to dependents, switching on to requirements', () => {
    expect(dependentsOf('chats')).toEqual(['councils']);
    expect(setFeatureEnabled([], 'chats', false)).toEqual(['chats', 'councils']);
    expect(setFeatureEnabled(['chats', 'councils'], 'councils', true)).toEqual([]);
    expect(setFeatureEnabled(['chats', 'councils'], 'chats', true)).toEqual(['councils']);
    expect(setFeatureEnabled(['notes'], 'media', false)).toEqual(['notes', 'media']);
  });

  it('answers off-ness by owner, and the frame is never off', () => {
    const off = ['councils', 'media'] as const;
    expect(isViewOff(off, 'councils')).toBe(true);
    expect(isViewOff(off, 'graph')).toBe(false);
    expect(isSettingsPageOff(off, 'media')).toBe(true);
    expect(isSettingsPageOff(off, 'accounts')).toBe(false);
    expect(isCommandOff(off, 'view.media')).toBe(true);
    expect(isCommandOff(off, 'palette.open')).toBe(false);
    expect(disabledViews(off)).toEqual(['councils', 'media']);
    expect(featureForView('reviews')).toBe('forge');
  });

  it('persists sparse, dropping unknown ids and repeats', () => {
    expect(StudioFeaturesPrefsSchema.parse({})).toEqual({ disabled: [] });
    expect(StudioFeaturesPrefsSchema.parse({ disabled: ['chats', 'nope', 'chats'] })).toEqual({ disabled: ['chats'] });
    const { prefs } = resolveSuitePrefs({ version: 1 });
    expect(prefs.studioFeatures).toEqual({ disabled: [] });
    expect(resolveSuitePrefs({ version: 1, studioFeatures: { disabled: ['notes'] } }).prefs.studioFeatures.disabled).toEqual([
      'notes',
    ]);
  });
});
