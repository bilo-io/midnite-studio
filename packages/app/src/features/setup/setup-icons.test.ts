import * as Lu from 'react-icons/lu';
import * as Si from 'react-icons/si';
import { describe, expect, it } from 'vitest';

import { SETUP_CATALOGUE } from '@midnite/studio-shared';

import { resolveSetupIcon, SETUP_ICONS } from './setup-icons';

/** Phase 98 Theme D — every catalogue icon resolves to the real `react-icons` export it names. */
const SETS: Record<string, Record<string, unknown>> = { lu: Lu, si: Si };

describe('SETUP_ICONS', () => {
  it('has an entry for every catalogue row', () => {
    for (const item of SETUP_CATALOGUE) {
      expect(SETUP_ICONS[`${item.icon.set}:${item.icon.name}`], item.id).toBeDefined();
    }
  });

  it('maps each key to the export of that name in that set', () => {
    for (const [key, component] of Object.entries(SETUP_ICONS)) {
      const [set, name] = key.split(':') as [string, string];
      expect(SETS[set]?.[name], key).toBeDefined();
      expect(component, key).toBe(SETS[set]?.[name]);
    }
  });

  it('falls back to a neutral box for an unmapped glyph', () => {
    expect(resolveSetupIcon({ set: 'si', name: 'SiNotAThing' })).toBe(Lu.LuBox);
    expect(resolveSetupIcon({ set: 'si', name: 'SiGit' })).toBe(Si.SiGit);
  });
});

describe('resolveSetupItemIcon', () => {
  it('gives every catalogue row a branded glyph, not the generic box fallback', async () => {
    const { resolveSetupItemIcon } = await import('./setup-icons');
    for (const item of SETUP_CATALOGUE) {
      expect(resolveSetupItemIcon(item), item.id).not.toBe(Lu.LuBox);
    }
  });

  it('prefers a per-id brand override over the catalogue ref', async () => {
    const { resolveSetupItemIcon, SETUP_ITEM_ICONS } = await import('./setup-icons');
    for (const id of ['az', 'codex', 'orbstack', 'ripgrep', 'jq']) {
      const item = SETUP_CATALOGUE.find((row) => row.id === id)!;
      expect(resolveSetupItemIcon(item), id).toBe(SETUP_ITEM_ICONS[id]);
    }
  });
});
