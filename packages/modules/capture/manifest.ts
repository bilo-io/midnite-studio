import { defineModuleManifest } from '@midnite/studio-shared';

/**
 * The Capture module (Phase 124 Theme D). Pure data both halves read: it imports
 * `@midnite/studio-shared` and nothing else. Mind mounts it as one nav group
 * (glyph + label, its view beneath); `apps/capture` still composes it on its own until Theme H.
 */
export const captureManifest = defineModuleManifest({
  module: 'capture',
  label: 'Capture',
  glyph: 'PiCameraFill',
  accent: '#f97316',
  features: ['capture'],
  views: [
    {
      id: 'capture',
      // Global: the screen is the machine's, not one checkout's.
      global: true,
      rail: {
        group: 'workspace',
        label: 'Capture',
        description: 'Screenshots, screen recordings and clipboard history — taken on your click, kept on this machine',
      },
    },
  ],
});
