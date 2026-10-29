import { optimizerManifest } from '@midnite/studio-feature-optimizer/renderer';
import type { NavConfig } from '@midnite/studio-frame';
import { LuActivity, LuCpu, LuHardDrive, LuMemoryStick } from 'react-icons/lu';

/**
 * The shell's rail (Phase 123 Theme B): the app's views, in its existing tab order. Settings is never
 * listed — `AppShell` puts it at the rail's foot. `panels` is absent, so the app carries every panel
 * (decision 12).
 */
const CLEANER_NAV: NavConfig = {
  views: [
    { id: 'storage', label: 'Storage', icon: LuHardDrive },
    { id: 'memory', label: 'Memory', icon: LuMemoryStick },
    { id: 'system', label: 'System', icon: LuActivity },
    { id: 'gpu', label: 'GPU', icon: LuCpu },
  ],
};

/**
 * Cleaner's app manifest — pure data (Phase 113 Theme H1).
 *
 * `accent` matches the launcher catalog's `cleaner` tile; the glyph is the
 * catalog's too (`PiSparkleFill`, rendered by `components/cleaner-mark.tsx` and
 * baked into `resources/icon.icns` by the launcher's `scripts/app-icons.cjs`). `home` is the one
 * view Cleaner opens on: the optimizer's main surface.
 */
export const CLEANER_APP = {
  id: 'cleaner',
  name: 'Midnite Cleaner',
  tagline: 'Workspace optimizer',
  accent: '#14b8a6',
  home: 'optimizer',
  features: [optimizerManifest.feature],
  nav: CLEANER_NAV,
} as const;

export type CleanerApp = typeof CLEANER_APP;
