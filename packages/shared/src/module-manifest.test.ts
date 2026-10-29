import { describe, expect, it } from 'vitest';

import { MODULE_IDS } from './modules';
import { defineModuleManifest } from './module-manifest';

describe('defineModuleManifest', () => {
  it('returns the literal unchanged and keeps its id a ModuleId', () => {
    const m = defineModuleManifest({ module: 'coder', label: 'Coder', glyph: 'LuCode', accent: '#6366f1', features: ['forge'], views: [] });
    expect(m).toEqual({ module: 'coder', label: 'Coder', glyph: 'LuCode', accent: '#6366f1', features: ['forge'], views: [] });
    expect(MODULE_IDS).toContain(m.module);
  });
});
