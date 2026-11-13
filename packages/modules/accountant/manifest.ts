import { defineModuleManifest } from '@midnite/studio-shared';

/**
 * The accountant module (Phase 129): double-entry books on the user's disk, kept in Money. Pure data both
 * halves read: it imports `@midnite/studio-shared` and nothing else. The glyph matches the launcher's
 * `accountant` tile (`PiCalculatorFill`). The ledger feature owns the engine; Studio shows it as its one
 * `books` view, so this module registers no view of its own.
 */
export const accountantManifest = defineModuleManifest({
  module: 'accountant',
  label: 'Accountant',
  glyph: 'PiCalculatorFill',
  accent: '#14b8a6',
  features: ['ledger'],
  views: [],
});
