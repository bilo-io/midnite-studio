import { describe, expect, it } from 'vitest';

import {
  composeFeatureIds,
  FEATURE_SETTINGS_PAGES,
  FEATURE_VIEWS,
  STUDIO_SETTINGS_PAGE_ORDER,
  STUDIO_VIEW_ORDER,
} from './feature-registrations';
import { FEATURE_PLACEMENT } from './placement';
import { SETTINGS_PAGE_IDS, VIEW_IDS } from './view';

/**
 * Phase 113 Theme C — the two literal arrays `view.ts` held before ids were
 * registered per feature, frozen here verbatim. Studio's composition must
 * reproduce them id for id and in order: these ids are persisted
 * (`activeView`, `settingsPage`, `navVisibility`), routed
 * (`midnite-studio://view?id=…&page=…`) and published as MCP enums, so a
 * reorder or a rename here is a migration, not a refactor.
 */
const LEGACY_VIEW_IDS = [
  'landing',
  'dashboard',
  'notes',
  'chats',
  'sessions',
  'knowledge',
  'files',
  'search',
  'optimizer',
  'tests',
  'database',
  'tasks',
  'graph',
  'actions',
  'reviews',
  'history',
  'councils',
  'workflows',
  'media',
  'models',
  'apiClient',
  'settings',
];

const LEGACY_SETTINGS_PAGE_IDS = [
  'appearance',
  'activity',
  'privacy',
  'graph',
  'diff',
  'sidebar',
  'search',
  'screenLock',
  'terminal',
  'agent',
  'reviews',
  'projects',
  'workflows',
  'media',
  'ollama',
  'gitSafety',
  'trashSafety',
  'apiClient',
  'monitor',
  'browser',
  'cli',
  'updates',
  'health',
  'optimizer',
  'mcp',
  'companion',
  'web-apps',
  'accounts',
];

describe('Studio composition', () => {
  it('unions the per-feature view registrations into the exact legacy VIEW_IDS', () => {
    expect([...VIEW_IDS]).toEqual(LEGACY_VIEW_IDS);
  });

  it('unions the per-feature settings page registrations into the exact legacy SETTINGS_PAGE_IDS', () => {
    expect([...SETTINGS_PAGE_IDS]).toEqual(LEGACY_SETTINGS_PAGE_IDS);
  });

  // Studio is the superset: an id a feature registered but Studio's order left
  // out would be an id no build can navigate to.
  it('takes every registered id, each exactly once', () => {
    const registeredViews = Object.values(FEATURE_VIEWS).flat();
    const registeredPages = Object.values(FEATURE_SETTINGS_PAGES).flat();
    expect([...VIEW_IDS].sort()).toEqual([...registeredViews].sort());
    expect([...SETTINGS_PAGE_IDS].sort()).toEqual([...registeredPages].sort());
    expect(new Set(VIEW_IDS).size).toBe(VIEW_IDS.length);
    expect(new Set(SETTINGS_PAGE_IDS).size).toBe(SETTINGS_PAGE_IDS.length);
  });

  it('mentions each feature exactly as often as it has ids', () => {
    const count = (order: readonly string[], feature: string) => order.filter((f) => f === feature).length;
    for (const [feature, ids] of Object.entries(FEATURE_VIEWS)) {
      expect(count(STUDIO_VIEW_ORDER, feature), feature).toBe(ids.length);
    }
    for (const [feature, ids] of Object.entries(FEATURE_SETTINGS_PAGES)) {
      expect(count(STUDIO_SETTINGS_PAGE_ORDER, feature), feature).toBe(ids.length);
    }
  });

  it('registers ids only under features the placement map knows', () => {
    const placed = new Set(Object.keys(FEATURE_PLACEMENT));
    for (const feature of [...Object.keys(FEATURE_VIEWS), ...Object.keys(FEATURE_SETTINGS_PAGES)]) {
      expect(placed.has(feature), feature).toBe(true);
    }
  });
});

describe('composeFeatureIds', () => {
  const registrations = { a: ['a1', 'a2'], b: ['b1'] } as const;

  it('gives each mention of a feature its next id, so features can interleave', () => {
    expect(composeFeatureIds(registrations, ['a', 'b', 'a'])).toEqual(['a1', 'b1', 'a2']);
  });

  it('lets a composition take a subset (an app need not wear every feature)', () => {
    expect(composeFeatureIds(registrations, ['b'])).toEqual(['b1']);
  });

  it('throws when a feature is mentioned more often than it has ids', () => {
    expect(() => composeFeatureIds(registrations, ['b', 'b'])).toThrow(/b has no id #2/);
  });
});
