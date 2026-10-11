import type { SettingsPageId } from '@midnite/studio-shared';

/**
 * Phase 112 Theme F — the named sections of each settings page, so a reveal (and, in Theme G, the
 * resolver and grammar) can say "Terminal settings, Memory" and scroll to it. `id` is the slug of the
 * section's heading, which is exactly what `SettingsAccordion` (and a few plain `<h3>`s) stamp on the
 * page as `data-settings-section`; `settings-sections.test.ts` keeps the two honest. A page with no
 * sections listed simply has none to point at.
 */
export type SettingsSection = { id: string; label: string; keywords: readonly string[] };

/** The anchor id for a section heading — lower-case, hyphen-separated (`~/.claude` → `dot-claude`). */
export const settingsSectionId = (title: string): string =>
  title
    .toLowerCase()
    .replace('~/.', 'dot-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const section = (label: string, ...keywords: string[]): SettingsSection => ({
  id: settingsSectionId(label),
  label,
  keywords,
});

export const SETTINGS_SECTIONS: Record<SettingsPageId, readonly SettingsSection[]> = {
  appearance: [
    section('Theme'),
    section('Background'),
    section('Effects'),
    section('Palette'),
    section('Titlebar Time'),
    section('Titlebar Date'),
  ],
  activity: [
    section('Preset'),
    section('Agent & shell style'),
    section('Status colours'),
    section('Preview'),
    section('Reset'),
  ],
  privacy: [
    section('Location'),
  ],
  graph: [
    section('Style'),
    section('Row density'),
    section('Agent provenance'),
    section('Columns'),
    section('Activity timeline'),
  ],
  diff: [
    section('Diff view'),
    section('File lists'),
  ],
  sidebar: [
    section('Navigation'),
    section('Sidenav'),
    section('View filters'),
    section('Repository Sync'),
  ],
  search: [
    section('Search Defaults'),
  ],
  screenLock: [
    section('Screensaver'),
    section('Weather'),
    section('Screen Lock'),
  ],
  terminal: [
    section('General'),
    section('Memory'),
    section('Appearance'),
    section('Agents'),
    section('Agent activity'),
    section('Renderer'),
  ],
  agent: [
    section('Agents'),
    section('Session stamping'),
    section('Claude'),
    section('midnite menu'),
    section('Loops'),
    section('~/.claude'),
  ],
  reviews: [],
  projects: [
    section('Launch and run'),
    section('Missing permission'),
    section('How this works'),
    section('Dependency graph'),
    section('Column → skill'),
    section('Auto-mate'),
  ],
  workflows: [
    section('Defaults'),
    section('Run history'),
  ],
  media: [
    section('General'),
    section('Video'),
    section('Images'),
    section('Audio'),
    section('Maps'),
    section('Games'),
  ],
  ollama: [],
  gitSafety: [
    section('Force-push'),
  ],
  trashSafety: [
    section('Empty Trash'),
  ],
  apiClient: [
    section('Requests'),
  ],
  mcp: [
    section('MCP Server'),
    section('Let agents steer the UI'),
    section('Let agents decide workflow gates'),
    section('Let agents edit 3D models'),
    section('Let agents edit terrains'),
    section('Let agents edit sprites and maps'),
    section('Let agents capture maps'),
    section('Let agents edit music'),
    section('Let agents run and edit games'),
    section('Let agents change companion settings'),
    section('Tools'),
    section('Recent calls'),
  ],
  companion: [
    section('Companion'),
    section('Voice'),
    section('Microphone'),
    section('Hands-free run'),
    section('Personality'),
    section('Profiles'),
  ],
  monitor: [
    section('Metrics'),
    section('Diagnostics'),
  ],
  browser: [
    section('Link handling'),
    section('Preview deployments'),
    section('Memory'),
    section('Data'),
  ],
  apps: [
    section('Third-party apps'),
  ],
  accounts: [
    section('Accounts'),
    section('Add an account'),
    section('Account switching'),
    section('How this works'),
    section('Reachable repositories'),
  ],
  cli: [
    section('Command line integration'),
  ],
  updates: [
    section('App Updates'),
  ],
  health: [],
  optimizer: [
    section('Workspace Optimizer'),
    section('System caches'),
  ],
};
