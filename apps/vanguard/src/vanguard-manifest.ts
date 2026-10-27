import { vanguardManifest } from '@midnite/studio-feature-vanguard/renderer';

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
} as const;

export type VanguardApp = typeof VANGUARD_APP;
