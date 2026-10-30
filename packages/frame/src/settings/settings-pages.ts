import type { ComponentType } from 'react';

import type { SettingsPageId } from '@midnite/studio-shared';

import type { IconComponent } from '../chrome/types';

/**
 * The shape of a settings view (Phase 123 Theme L.3) — what the frame's `SettingsView` renders and what
 * every app's composer hands it. The page components stay each app's: the frame holds the layout, the
 * grouping and the suite-wide page list, never an app's own pages.
 */

/**
 * The categories pages sort into, in UX priority order. Moved here from Studio's `ui-store.ts`, which
 * re-exports them; an app with only a handful of pages simply has fewer non-empty groups.
 */
export type SettingsGroupId = 'general' | 'git' | 'tools' | 'ai' | 'system';

export const SETTINGS_GROUPS: { id: SettingsGroupId; label: string }[] = [
  { id: 'general', label: 'General & UI' },
  { id: 'git', label: 'Git & Diff' },
  { id: 'tools', label: 'Developer Tools' },
  { id: 'ai', label: 'AI & Extensibility' },
  { id: 'system', label: 'System & Maintenance' },
];

/**
 * The frame-only read-only chords page. Not a `SettingsPageId`: that union is Studio's registry of
 * persisted pages, and this one has nothing to persist.
 */
export const CHORDS_PAGE_ID = 'chords';

/** An app-owned page outside Studio's registry: `app:<name>`. */
export type AppSettingsPageId = `app:${string}`;

export type SettingsPageKey = SettingsPageId | typeof CHORDS_PAGE_ID | AppSettingsPageId;

export type SettingsPageDef = {
  id: SettingsPageKey;
  label: string;
  group: SettingsGroupId;
  /** `suite`: reads and writes the suite-prefs file only. `app`: persists however the app chooses. */
  scope: 'suite' | 'app';
  icon?: IconComponent;
  Page: ComponentType;
};

/** The pages every suite app shows, in order (Decision 6: their state is the suite-prefs file). */
export const SUITE_SETTINGS_PAGES = [
  { id: 'appearance', label: 'Appearance', group: 'general' },
  { id: 'privacy', label: 'Privacy', group: 'general' },
  { id: 'terminal', label: 'Terminal', group: 'tools' },
  { id: 'companion', label: 'Companion', group: 'ai' },
  { id: 'monitor', label: 'Monitor & Diagnostics', group: 'system' },
] as const satisfies readonly { id: SettingsPageId; label: string; group: SettingsGroupId }[];

export type SuiteSettingsPageId = (typeof SUITE_SETTINGS_PAGES)[number]['id'];

/**
 * The suite pages as page defs: the five above with the components the composer supplies, then the
 * read-only chords page. `chords` is the frame's own; the composer passes the rest.
 */
export function suiteSettingsPages(
  components: Record<SuiteSettingsPageId, ComponentType>,
  chords: ComponentType,
  icons: Partial<Record<SettingsPageKey, IconComponent>> = {},
): SettingsPageDef[] {
  return [
    ...SUITE_SETTINGS_PAGES.map((entry) => ({
      ...entry,
      scope: 'suite' as const,
      icon: icons[entry.id],
      Page: components[entry.id],
    })),
    {
      id: CHORDS_PAGE_ID,
      label: 'Keyboard shortcuts',
      group: 'general',
      scope: 'suite',
      icon: icons[CHORDS_PAGE_ID],
      Page: chords,
    },
  ];
}

/**
 * An app's own pages: the ids its manifest lists in `settings`, resolved against the composer's
 * registry of page defs. An id with no registry entry is dropped here and named by
 * {@link settingsPageProblems}, which each app's test asserts is `[]`.
 */
export function appSettingsPages(
  ids: readonly SettingsPageId[] | undefined,
  registry: Partial<Record<SettingsPageId, Omit<SettingsPageDef, 'scope'>>>,
): SettingsPageDef[] {
  const out: SettingsPageDef[] = [];
  for (const id of ids ?? []) {
    const entry = registry[id];
    if (entry) out.push({ ...entry, scope: 'app' });
  }
  return out;
}

/** Problems with a manifest's settings list: an unknown id, a duplicate, or one that shadows a suite page. */
export function settingsPageProblems(
  ids: readonly SettingsPageId[] | undefined,
  registry: Partial<Record<SettingsPageId, unknown>>,
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const suite = new Set<string>(SUITE_SETTINGS_PAGES.map((p) => p.id));
  for (const id of ids ?? []) {
    if (!(id in registry)) problems.push(`settings page "${id}" has no registered page`);
    if (seen.has(id)) problems.push(`settings page "${id}" is listed twice`);
    if (suite.has(id)) problems.push(`settings page "${id}" is a suite page — the shell adds it`);
    seen.add(id);
  }
  return problems;
}
