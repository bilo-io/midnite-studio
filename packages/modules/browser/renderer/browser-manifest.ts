import type { NavConfig } from '@midnite/studio-frame';
import { LuGlobe } from 'react-icons/lu';

/**
 * The shell's rail (Phase 123 Theme H): Browser's one surface. Settings sits below it, so the rail is
 * never one item. The agent-session button and the web apps live in the strip above the page, not the rail.
 */
const BROWSER_NAV: NavConfig = {
  views: [{ id: 'browse', label: 'Browse', icon: LuGlobe }],
};

/**
 * Browser's app manifest — pure data. `accent` is the launcher catalog's `browser` tile colour;
 * `home` is the one view Browser opens on.
 */
export const BROWSER_APP = {
  id: 'browser',
  name: 'Midnite Browser',
  accent: '#f59e0b',
  home: 'browse',
  nav: BROWSER_NAV,
} as const;
