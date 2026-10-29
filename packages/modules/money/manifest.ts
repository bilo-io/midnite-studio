import { defineModuleManifest } from '@midnite/studio-shared';

/**
 * The Money module (Phase 124 Theme E): the money host's own features as a module, so every app is uniformly a
 * list of modules. Pure data both halves read: it imports `@midnite/studio-shared` and nothing else.
 */
export const moneyManifest = defineModuleManifest({
  module: 'money',
  label: 'Money',
  glyph: 'PiCoinsFill',
  accent: '#84cc16',
  features: ['finance'],
  views: [],
});

export type MoneyManifest = typeof moneyManifest;
