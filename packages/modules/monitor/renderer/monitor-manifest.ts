import { monitorManifest } from '@midnite/studio-feature-monitor/renderer';
import type { NavConfig, NavGroup } from '@midnite/studio-frame';
import { PiPulseFill } from 'react-icons/pi';
import { monitorManifest as monitorModuleManifest } from '../manifest';
import { LuActivity } from 'react-icons/lu';

/**
 * The shell's rail (Phase 123 Theme B): its one view (Settings sits below it, so the rail is never one
 * item). Settings is never listed — `AppShell` puts it at the rail's foot. `panels` is absent, so the
 * app carries every panel (decision 12).
 */
const MONITOR_NAV: NavConfig = {
  views: [
    { id: 'monitor', label: 'Monitor', icon: LuActivity },
  ],
};

/**
 * Monitor's app manifest — pure data (Phase 113 Theme I).
 *
 * `accent` matches the launcher catalog's `monitor` tile; the glyph is the
 * catalog's too (`PiPulseFill`, rendered by the home view and baked into
 * `resources/icon.icns` by the launcher's `scripts/app-icons.cjs`). `home` is the one view
 * Monitor opens on.
 */
export const MONITOR_APP = {
  id: 'monitor',
  name: 'Midnite Monitor',
  tagline: 'Live state of your machine',
  accent: '#ef4444',
  home: 'monitor',
  features: [monitorManifest.feature],
  nav: MONITOR_NAV,
} as const;

export type MonitorApp = typeof MONITOR_APP;

/**
 * This module's nav group in a host's rail (Phase 124 Theme E.3): one row, since the page keeps its own tabs.
 * A host composes it with `navFromModules`; the module's accent shows on the group label only.
 */
export const MONITOR_NAV_GROUP: NavGroup = {
  id: 'monitor',
  label: monitorModuleManifest.label,
  icon: PiPulseFill,
  accent: monitorModuleManifest.accent,
  views: [{ id: 'monitor', label: 'Monitor', icon: PiPulseFill }],
};
