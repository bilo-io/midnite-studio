import { optimizerManifest } from '@midnite/studio-feature-optimizer/renderer';

/**
 * Cleaner's app manifest — pure data (Phase 113 Theme H1).
 *
 * `accent` matches the launcher catalog's `cleaner` tile; the glyph is the
 * catalog's too (`PiSparkleFill`, rendered by `components/cleaner-mark.tsx` and
 * baked into `resources/icon.icns` by `scripts/make-icon.mjs`). `home` is the one
 * view Cleaner opens on: the optimizer's main surface.
 */
export const CLEANER_APP = {
  id: 'cleaner',
  name: 'Midnite Cleaner',
  tagline: 'Workspace optimizer',
  accent: '#14b8a6',
  home: 'optimizer',
  features: [optimizerManifest.feature],
} as const;

export type CleanerApp = typeof CLEANER_APP;
