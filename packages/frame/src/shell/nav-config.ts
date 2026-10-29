import { COMMANDS, isCommandId, type CommandId, type SettingsPageId } from '@midnite/studio-shared';

import type { IconComponent } from '../chrome/types';

/*
  The shape every suite app's manifest hands `AppShell` (Phase 123 Theme B).

  `IconComponent` is the structural icon type `packages/app/src/components/icon-button.tsx` first
  declared; Phase 113 Theme C already moved its definition into the frame (`chrome/types.ts`), so it is
  re-exported here rather than declared twice — the nav's icons and every frame control's icons are the
  same type, and `packages/app` keeps re-exporting it from where it always lived.
*/
export type { IconComponent } from '../chrome/types';

/** One row of an app's nav rail. `command` is the `CommandId` that navigates there, if any. */
export type NavView = {
  id: string;
  label: string;
  icon: IconComponent;
  command?: CommandId;
};

/**
 * An app's views, in rail order. Settings is never one of them — `AppShell` puts it in the rail's
 * footer — and a single-view app lists its tabs here so the rail is never one item (decision 4).
 */
export type NavConfig = {
  views: readonly NavView[];
};

/** Which panels an app carries. Absent, or a key left out, means on (decision 12). */
export type ShellPanels = {
  terminal?: boolean;
  companion?: boolean;
  fab?: boolean;
};

/** The shell fields each `apps/<id>/src/<id>-manifest.ts` constant carries beside its id, name and accent. */
export type ShellManifestFields = {
  nav: NavConfig;
  panels?: ShellPanels;
  /** The app's own Settings pages (Theme L). */
  settings?: readonly SettingsPageId[];
};

/** The view id Settings is reached by — `onNavigate('settings')`. */
export const SETTINGS_VIEW = 'settings';

/** A nav row's `href` for `AppFrame`, and back. Views are flat, so a path is just `/<id>`. */
export const pathForNavView = (view: string): string => `/${view}`;
export const navViewForPath = (path: string): string => path.replace(/^\//, '');

/**
 * Problems with a nav config, empty when it is sound: at least one view, unique ids, no `settings` row,
 * and every `command` a real `CommandId`. Each app's manifest test asserts this is `[]`.
 */
export function navConfigProblems(nav: NavConfig): string[] {
  const problems: string[] = [];
  if (nav.views.length === 0) problems.push('nav has no views');
  const seen = new Set<string>();
  for (const view of nav.views) {
    if (seen.has(view.id)) problems.push(`duplicate view id "${view.id}"`);
    seen.add(view.id);
    if (view.id === SETTINGS_VIEW) problems.push('Settings belongs in the footer, not in nav.views');
    if (view.command !== undefined && !isCommandId(view.command)) {
      problems.push(`view "${view.id}" names unknown command "${String(view.command)}"`);
    }
  }
  return problems;
}

const isMacPlatform = (): boolean =>
  typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent);

/**
 * A declared chord as the rail's tooltip shows it — `Mod+Shift+g` reads `⌘⇧G` on macOS and
 * `Ctrl+Shift+G` elsewhere. The same rendering as Studio's `displayChord` (`chord-hint.ts`).
 */
export function displayChord(chord: string, mac: boolean = isMacPlatform()): string {
  const platform = mac ? chord.replace(/^Mod\+/, '⌘').replace(/Shift\+/, '⇧') : chord.replace(/^Mod\+/, 'Ctrl+');
  return platform.replace(/(^|[+⌘⇧])([a-z])$/, (_, lead: string, letter: string) => lead + letter.toUpperCase());
}

/**
 * `chordFor` for an app with no keymap of its own: a view's chord is its `command`'s declared chord in
 * `COMMANDS`, or nothing (and so no tooltip) when it has no command or the command has no chord. Studio
 * passes its own `navChord` instead.
 */
export function navChordFor(nav: NavConfig, mac?: boolean): (view: string) => string | undefined {
  const chords = new Map<string, string>();
  for (const view of nav.views) {
    if (view.command === undefined) continue;
    const command = COMMANDS.find((c) => c.id === view.command);
    const chord = command !== undefined && 'chord' in command ? command.chord : undefined;
    if (chord !== undefined) chords.set(view.id, displayChord(chord, mac));
  }
  return (view) => chords.get(view);
}
