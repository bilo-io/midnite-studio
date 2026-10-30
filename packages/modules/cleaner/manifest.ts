import { defineModuleManifest } from '@midnite/studio-shared';

/**
 * The Cleaner module (Phase 124 Theme D). Pure data both halves read: it imports
 * `@midnite/studio-shared` and nothing else. Vanguard mounts it as one nav group
 * (glyph + label, its view beneath); its standalone app was deleted in Theme H, so a host mounts it.
 */
export const cleanerManifest = defineModuleManifest({
  module: 'cleaner',
  label: 'Cleaner',
  glyph: 'PiSparkleFill',
  accent: '#14b8a6',
  features: ['optimizer'],
  views: [
    {
      id: 'optimizer',
      // Global: it inspects the machine, not one checkout.
      global: true,
      rail: {
        group: 'workspace',
        label: 'Cleaner',
        description: 'Scan memory, GPU and storage use and reclaim space',
      },
    },
  ],
});
