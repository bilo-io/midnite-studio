/**
 * Phase 124 Theme A — the module contract. An app is a list of modules; a module is one
 * composable slice (a feature or two plus their views) that a host mounts. Pure data and no
 * imports, so the launcher, links, placement and MCP tool owners can all rewrite their app-id
 * lists against this one source.
 *
 * `creator` is one module mounted in three hosts (agents, media, gamer). Studio is the superset
 * and lists every module. Startup and Health are untouched by Phase 124 and carry no modules.
 */

export const MODULE_IDS = [
  'agents',
  'coder',
  'creator',
  'media',
  'gamer',
  'vanguard',
  'vault',
  'cleaner',
  'monitor',
  'mind',
  'capture',
  'money',
  'accountant',
  'science',
  'simulator',
  'browser',
  'studio',
] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

/** The apps that host modules once the overlapping apps are merged. */
export const MODULE_HOST_IDS = [
  'studio',
  'agents',
  'media',
  'gamer',
  'vanguard',
  'mind',
  'money',
  'science',
  'browser',
] as const;
export type ModuleHostId = (typeof MODULE_HOST_IDS)[number];

/** Each host's modules, the host's own first. Studio composes every module. */
export const APP_MODULES: Record<ModuleHostId, readonly ModuleId[]> = {
  studio: MODULE_IDS,
  agents: ['agents', 'coder', 'creator'],
  media: ['media', 'creator'],
  gamer: ['gamer', 'creator'],
  vanguard: ['vanguard', 'vault', 'cleaner', 'monitor'],
  mind: ['mind', 'capture'],
  money: ['money', 'accountant'],
  science: ['science', 'simulator'],
  browser: ['browser'],
};

/** Apps merged into a host by Phase 124. */
export const RETIRED_APP_IDS = [
  'coder',
  'creator',
  'vault',
  'cleaner',
  'monitor',
  'capture',
  'accountant',
  'simulator',
] as const;
export type RetiredAppId = (typeof RETIRED_APP_IDS)[number];

/** Where a retired app now lives: its host and the module that opens on it. */
export const RETIRED_APP_ALIASES: Record<RetiredAppId, { app: ModuleHostId; module: ModuleId }> = {
  coder: { app: 'agents', module: 'coder' },
  creator: { app: 'agents', module: 'creator' },
  vault: { app: 'vanguard', module: 'vault' },
  cleaner: { app: 'vanguard', module: 'cleaner' },
  monitor: { app: 'vanguard', module: 'monitor' },
  capture: { app: 'mind', module: 'capture' },
  accountant: { app: 'money', module: 'accountant' },
  simulator: { app: 'science', module: 'simulator' },
};
