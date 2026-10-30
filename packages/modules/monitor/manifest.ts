import { defineModuleManifest } from '@midnite/studio-shared';

/**
 * The Monitor module (Phase 124 Theme D). Pure data both halves read: it imports
 * `@midnite/studio-shared` and nothing else. Vanguard mounts it as one nav group
 * (glyph + label, its view beneath); its standalone app was deleted in Theme H, so a host mounts it.
 */
export const monitorManifest = defineModuleManifest({
  module: 'monitor',
  label: 'Monitor',
  glyph: 'PiPulseFill',
  accent: '#ef4444',
  features: ['monitor'],
  views: [
    {
      id: 'monitor',
      // Global: it reads the machine, not one checkout.
      global: true,
      rail: {
        group: 'workspace',
        label: 'Monitor',
        description: 'CPU, memory, GPU, disk and battery, toolchain health and the crash log',
      },
    },
  ],
});
