import { defineModuleManifest } from '@midnite/studio-shared';

/**
 * The Simulator module (Phase 127 Theme A): deterministic sandboxes for cellular automata, gravity and agent
 * worlds. Pure data both halves read: it imports `@midnite/studio-shared` and nothing else.
 */
export const simulatorManifest = defineModuleManifest({
  module: 'simulator',
  label: 'Simulator',
  glyph: 'PiPlanetFill',
  accent: '#6366f1',
  features: [],
  views: [],
});

export type SimulatorManifest = typeof simulatorManifest;
