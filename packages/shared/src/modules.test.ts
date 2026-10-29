import { describe, expect, it } from 'vitest';
import {
  APP_MODULES,
  MODULE_HOST_IDS,
  MODULE_IDS,
  RETIRED_APP_ALIASES,
  RETIRED_APP_IDS,
} from './modules';

const hosts = MODULE_HOST_IDS;

describe('module contract', () => {
  it('has no duplicate ids and one APP_MODULES row per host', () => {
    expect(new Set(MODULE_IDS).size).toBe(MODULE_IDS.length);
    expect(Object.keys(APP_MODULES).sort()).toEqual([...hosts].sort());
  });

  it('lists every module in at least one app', () => {
    const listed = new Set(hosts.flatMap((h) => APP_MODULES[h]));
    for (const m of MODULE_IDS) expect(listed.has(m), m).toBe(true);
  });

  it('puts a non-studio host\'s own module first', () => {
    for (const h of hosts.filter((x) => x !== 'studio')) expect(APP_MODULES[h][0]).toBe(h);
  });

  it('has studio compose every module', () => {
    expect([...APP_MODULES.studio]).toEqual([...MODULE_IDS]);
  });

  it('resolves every retired id to a host that lists that module', () => {
    expect(Object.keys(RETIRED_APP_ALIASES).sort()).toEqual([...RETIRED_APP_IDS].sort());
    for (const id of RETIRED_APP_IDS) {
      const { app, module } = RETIRED_APP_ALIASES[id];
      expect(module).toBe(id);
      expect(APP_MODULES[app]).toContain(module);
    }
  });

  it('mounts creator in exactly agents, media and gamer (besides studio)', () => {
    const hostsOfCreator = hosts.filter((h) => h !== 'studio' && APP_MODULES[h].includes('creator'));
    expect([...hostsOfCreator].sort()).toEqual(['agents', 'gamer', 'media']);
  });
});
