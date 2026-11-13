/**
 * Startup's app manifest — pure data. `accent` matches the launcher catalog's `startup` tile; `home` is the one
 * view Startup opens on.
 */
export const STARTUP_APP = {
  id: 'startup',
  name: 'Midnite Startup',
  tagline: 'Roadmap, runway and invoices',
  accent: '#8b5cf6',
  home: 'startup.overview',
} as const;

export type StartupApp = typeof STARTUP_APP;
