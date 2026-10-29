import { notesManifest } from '@midnite/studio-feature-notes/renderer';
import type { NavConfig } from '@midnite/studio-frame';
import { LuNetwork, LuNotebookPen } from 'react-icons/lu';

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
  nav: MIND_NAV,
} as const;

export type MindApp = typeof MIND_APP;
