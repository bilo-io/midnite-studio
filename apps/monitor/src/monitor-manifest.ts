import { monitorManifest } from '@midnite/studio-feature-monitor/renderer';

/**
 * Monitor's app manifest — pure data (Phase 113 Theme I).
 *
 * `accent` matches the launcher catalog's `monitor` tile; the glyph is the
 * catalog's too (`PiPulseFill`, rendered by the home view and baked into
 * `resources/icon.icns` by `scripts/make-icon.mjs`). `home` is the one view
 * Monitor opens on.
 */
export const MONITOR_APP = {
  id: 'monitor',
  name: 'Midnite Monitor',
  tagline: 'Live state of your machine',
  accent: '#ef4444',
  home: 'monitor',
  features: [monitorManifest.feature],
} as const;

export type MonitorApp = typeof MONITOR_APP;
