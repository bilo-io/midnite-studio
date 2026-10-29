import { defineModuleManifest } from '@midnite/studio-shared';

/**
 * The Vanguard module (Phase 124 Theme E): the vanguard host's own features as a module, so every app is uniformly a
 * list of modules. Pure data both halves read: it imports `@midnite/studio-shared` and nothing else.
 */
export const vanguardManifest = defineModuleManifest({
  module: 'vanguard',
  label: 'Vanguard',
  glyph: 'PiShieldCheckFill',
  accent: '#e11d48',
  features: ['vanguard'],
  views: [
    { id: 'vanguard', global: false },
  ],
});

export type VanguardManifest = typeof vanguardManifest;
