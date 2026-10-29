import { describe, expect, it } from 'vitest';

import { APP_MODULES, MODULE_HOST_IDS, RETIRED_APP_ALIASES, RETIRED_APP_IDS } from '@midnite/studio-shared/modules';

import {
  APPS,
  APP_IDS,
  BUNDLE_APP_IDS,
  LEGACY_APP_HOSTS,
  LEGACY_BUNDLE_APP_IDS,
  LEGACY_BUNDLE_NAMES,
  SECTION_ORDER,
  appById,
  tileIdFor,
} from './catalog';

describe('the 11-app catalog (Phase 124 Theme F)', () => {
  it('lists eleven apps, in one section, with none of the merged apps as a tile', () => {
    expect(APP_IDS).toHaveLength(11);
    expect(SECTION_ORDER).toEqual(['suite']);
    expect(APPS.every((a) => a.section === 'suite')).toBe(true);
    for (const id of RETIRED_APP_IDS) expect(APP_IDS as readonly string[]).not.toContain(id);
  });

  it('gives every host the modules `APP_MODULES` names, its own first', () => {
    for (const host of MODULE_HOST_IDS) {
      // Studio composes every module but its tile lists only its own.
      const expected = host === 'studio' ? ['studio'] : APP_MODULES[host];
      expect(appById(host).modules.map((m) => m.id)).toEqual(expected);
    }
    expect(appById('startup').modules).toEqual([]);
    expect(appById('health').modules).toEqual([]);
  });

  it('flattens each app\'s features from its modules, with unique ids', () => {
    for (const app of APPS) {
      if (app.modules.length > 0) expect(app.features).toEqual(app.modules.flatMap((m) => m.features));
      expect(new Set(app.features.map((f) => f.id)).size).toBe(app.features.length);
    }
  });

  it('marks Accountant and Simulator coming soon at module level, with Money still installable', () => {
    const module = (app: Parameters<typeof appById>[0], id: string) => appById(app).modules.find((m) => m.id === id)!;
    expect(module('money', 'accountant').comingSoon).toBe(true);
    expect(module('science', 'simulator').comingSoon).toBe(true);
    expect(appById('money').comingSoon).toBeUndefined();
    expect(module('money', 'money').comingSoon).toBeUndefined();
  });

  it('folds each absorbed app\'s tagline and vision into its module', () => {
    for (const id of RETIRED_APP_IDS) {
      const { app, module } = RETIRED_APP_ALIASES[id];
      const found = appById(app).modules.find((m) => m.id === module);
      expect(found?.vision, id).toBeTruthy();
      expect(found?.features.length, id).toBeGreaterThan(0);
    }
  });
});

describe('retired ids', () => {
  it('mirrors the shared aliases', () => {
    expect(LEGACY_APP_HOSTS).toEqual(RETIRED_APP_ALIASES);
    expect(Object.keys(LEGACY_APP_HOSTS).sort()).toEqual([...RETIRED_APP_IDS].sort());
  });

  it('keeps bundles for the six that still build, keyed apart from the tiles', () => {
    expect([...LEGACY_BUNDLE_APP_IDS].sort()).toEqual(
      RETIRED_APP_IDS.filter((id) => id !== 'accountant' && id !== 'simulator').sort(),
    );
    expect(Object.keys(LEGACY_BUNDLE_NAMES).sort()).toEqual([...LEGACY_BUNDLE_APP_IDS].sort());
    expect(BUNDLE_APP_IDS).toHaveLength(APP_IDS.length + LEGACY_BUNDLE_APP_IDS.length);
  });

  it('resolves a retired id to the tile that carries it', () => {
    expect(tileIdFor('coder')).toBe('agents');
    expect(tileIdFor('vault')).toBe('vanguard');
    expect(tileIdFor('capture')).toBe('mind');
    expect(tileIdFor('gamer')).toBe('gamer');
    expect(tileIdFor('toString')).toBeNull();
    expect(tileIdFor('nope')).toBeNull();
  });
});
