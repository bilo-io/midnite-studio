import { notesManifest } from '@midnite/studio-feature-notes/renderer';
import { navFromModules, type NavConfig } from '@midnite/studio-frame';
import { LuNetwork, LuNotebookPen } from 'react-icons/lu';
import { APP_MODULES } from '@midnite/studio-shared';
import { PiBrainFill } from 'react-icons/pi';
import { mindManifest } from '../manifest';

/**
 * The shell's rail (Phase 123 Theme B): the app's views, in its existing tab order. Settings is never
 * listed — `AppShell` puts it at the rail's foot. `panels` is absent, so the app carries every panel
 * (decision 12).
 */
const MIND_NAV: NavConfig = {
  views: [
    { id: 'notes', label: 'Notes', icon: LuNotebookPen },
    { id: 'knowledge', label: 'Knowledge', icon: LuNetwork },
  ],
};

/**
 * The rail, derived from `APP_MODULES.mind` (Phase 124 Theme E.2): one titled group per module the host mounts,
 * this module's views beneath. Modules the host does not mount yet have no entry, so wiring one in (E.3) adds
 * its group here and nothing else.
 */
const MIND_HOST_NAV: NavConfig = navFromModules(APP_MODULES.mind, {
  mind: { id: 'mind', label: mindManifest.label, icon: PiBrainFill, accent: mindManifest.accent, views: MIND_NAV.views },
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
