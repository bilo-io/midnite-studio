import { defineModuleManifest } from '@midnite/studio-shared';

/**
 * The Health module (Phase 128 Theme A): body metrics, meals, workouts and trends, all local. Pure data both
 * halves read: it imports `@midnite/studio-shared` and nothing else. `features` and `views` are empty because
 * the code lives in the module and the host's rail ids are host-local strings, not Studio `ViewId`s.
 */
export const healthManifest = defineModuleManifest({
  module: 'health',
  label: 'Health',
  glyph: 'PiHeartbeatFill',
  accent: '#f43f5e',
  features: [],
  views: [],
});

export type HealthManifest = typeof healthManifest;
