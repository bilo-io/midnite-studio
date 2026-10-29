import { vanguardManifest } from '@midnite/studio-feature-vanguard/renderer';
import type { NavConfig } from '@midnite/studio-frame';
import { LuNetwork, LuRadar, LuShieldAlert } from 'react-icons/lu';

/**
 * The shell's rail (Phase 123 Theme B): the app's views, in its existing tab order. Settings is never
 * listed — `AppShell` puts it at the rail's foot. `panels` is absent, so the app carries every panel
 * (decision 12).
 */
const VANGUARD_NAV: NavConfig = {
  views: [
    { id: 'findings', label: 'Findings', icon: LuShieldAlert },
    { id: 'sensors', label: 'Sensors', icon: LuRadar },
    { id: 'network', label: 'Network', icon: LuNetwork },
  ],
};

/**
 * Vanguard's app manifest — pure data (Phase 120 Theme B).
 *
 * `accent` matches the launcher catalog's `vanguard` tile. `home` is the one view Vanguard opens on.
 */
export const VANGUARD_APP = {
  id: 'vanguard',
  name: 'Midnite Vanguard',
  tagline: 'Antivirus and agentic self-defense',
  accent: '#e11d48',
  home: 'vanguard',
  features: [vanguardManifest.feature],
  nav: VANGUARD_NAV,
} as const;

export type VanguardApp = typeof VANGUARD_APP;
