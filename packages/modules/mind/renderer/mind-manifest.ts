import { notesManifest } from '@midnite/studio-feature-notes/renderer';
import { navFromModules } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';
import { MIND_NAV_GROUP } from './mind-nav';

/**
 * The rail, derived from `APP_MODULES.mind` (Phase 124 Theme E.2): one titled group per module the host mounts,
 * this module's views beneath. Modules the host does not mount yet have no entry, so wiring one in (E.3) adds
 * its group here and nothing else.
 */
const MIND_HOST_NAV = navFromModules(APP_MODULES.mind, {
  mind: MIND_NAV_GROUP,
});

/**
 * Mind's app manifest — pure data (Phase 113 Theme M).
 *
 * `accent` matches the launcher catalog's `mind` tile; the glyph is the
 * catalog's too (`PiBrainFill`, rendered by the home view and baked into
 * `resources/icon.icns` by the launcher's `scripts/app-icons.cjs`). `home` is the one view
 * Mind opens on.
 */
export const MIND_APP = {
  id: 'mind',
  name: 'Midnite Mind',
  tagline: 'Notes and spaced review',
  accent: '#0ea5e9',
  home: 'notes',
  features: [notesManifest.feature],
  nav: MIND_HOST_NAV,
} as const;

export type MindApp = typeof MIND_APP;
