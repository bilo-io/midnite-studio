import { describe, expect, it } from 'vitest';

import { APP_MODULES, RETIRED_APP_IDS } from '../modules';
import { FEATURE_HOSTS, FEATURE_PLACEMENT, placementHosts, retiredAppHost } from './placement';

describe('placement on host apps (Phase 124 Theme G)', () => {
  it('re-expresses the placement map on hosts', () => {
    expect(FEATURE_HOSTS.forge).toEqual(['agents']);
    expect(FEATURE_HOSTS.reviews).toEqual(['agents']);
    expect(FEATURE_HOSTS.optimizer).toEqual(['vanguard']);
    expect(FEATURE_HOSTS.vault).toEqual(['vanguard']);
    expect(FEATURE_HOSTS.capture).toEqual(['mind']);
    expect(FEATURE_HOSTS.notes).toEqual(['mind']);
    expect(FEATURE_HOSTS.slides).toEqual(['agents', 'media', 'gamer']);
    expect(FEATURE_HOSTS.media).toEqual(['agents', 'media', 'gamer']);
  });

  it('gives every app-owned folder at least one host, and frame folders none', () => {
    for (const [folder, hosts] of Object.entries(FEATURE_HOSTS)) {
      const placement = (FEATURE_PLACEMENT as Record<string, unknown>)[folder];
      if (placement === 'frame') expect(hosts, folder).toEqual([]);
      else expect(hosts.length, folder).toBeGreaterThan(0);
    }
  });

  it('never names Studio or a retired app as a host', () => {
    for (const hosts of Object.values(FEATURE_HOSTS)) {
      for (const host of hosts) {
        expect(host).not.toBe('studio');
        expect(RETIRED_APP_IDS as readonly string[]).not.toContain(host);
      }
    }
    expect(placementHosts('creator')).toEqual(['agents', 'media', 'gamer']);
    expect(placementHosts('frame')).toEqual([]);
  });

  it('every host carries the layer it is listed for', () => {
    for (const layer of ['coder', 'creator', 'vault', 'cleaner', 'monitor', 'capture', 'agents'] as const) {
      for (const host of placementHosts(layer)) expect(APP_MODULES[host]).toContain(layer);
    }
  });

  it('maps a retired app to its host', () => {
    expect(retiredAppHost('coder')).toBe('agents');
    expect(retiredAppHost('cleaner')).toBe('vanguard');
    expect(retiredAppHost('agents')).toBeUndefined();
    expect(retiredAppHost('toString')).toBeUndefined();
  });
});
