import { optimizerManifest } from '@midnite/studio-feature-optimizer/renderer';
import type { NavConfig, NavGroup } from '@midnite/studio-frame';
import { PiSparkleFill } from 'react-icons/pi';
import { cleanerManifest as cleanerModuleManifest } from '../manifest';
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

/**
 * This module's nav group in a host's rail (Phase 124 Theme E.3): one row, since the page keeps its own tabs.
 * A host composes it with `navFromModules`; the module's accent shows on the group label only.
 */
export const CLEANER_NAV_GROUP: NavGroup = {
  id: 'cleaner',
  label: cleanerModuleManifest.label,
  icon: PiSparkleFill,
  accent: cleanerModuleManifest.accent,
  views: [{ id: 'cleaner', label: 'Cleaner', icon: PiSparkleFill }],
};
