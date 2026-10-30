import { useState, type ReactNode } from 'react';

import { LuKeyboard, LuPalette } from 'react-icons/lu';
import type { SuiteAppId } from '@midnite/studio-shared';

import { useAppearanceSync } from '../prefs/appearance-store';
import { ChordsPage } from '../settings/chords-page';
import { CHORDS_PAGE_ID, type SettingsPageDef } from '../settings/settings-pages';
import { SettingsView } from '../settings/settings-view';
import { SuiteAppearancePage } from '../settings/suite-appearance-page';
import { AppShell, type AppShellPanels } from './app-shell';
import { SETTINGS_VIEW, type NavConfig } from './nav-config';
import { StatusBar } from './status-bar/status-bar';
import type { StatusSegment } from './status-bar/segments';
import { suiteSegments, type AppPanels } from './status-bar/suite-segments';

/**
 * The suite pages a non-Studio app can show today (Phase 123 Theme H): Appearance and the read-only chord
 * table. Privacy, Terminal, Companion and Monitor pages still live in `packages/app` on Studio's `ui-store`
 * and join once they are extracted.
 */
export const SUITE_APP_SETTINGS_PAGES: readonly SettingsPageDef[] = [
  { id: 'appearance', label: 'Appearance', group: 'general', scope: 'suite', icon: LuPalette, Page: SuiteAppearancePage },
  { id: CHORDS_PAGE_ID, label: 'Keyboard shortcuts', group: 'general', scope: 'suite', icon: LuKeyboard, Page: ChordsPage },
];

export type SuiteAppShellProps = {
  app: SuiteAppId;
  name: string;
  accent: string;
  nav: NavConfig;
  /** The view the app opens on, when it does not control `view` itself. */
  home: string;
  /** Controlled active view — an app whose view lives in its own store (Media's active tab) passes it. */
  view?: string;
  onViewChange?: (view: string) => void;
  /** The app's own settings pages, after the suite's. */
  settingsPages?: readonly SettingsPageDef[];
  /** Status-bar segments the app owns, after the suite's. */
  segments?: readonly StatusSegment[];
  /** The suite segments the app can honestly serve (a panel it lacks is absent, never a dead button). */
  statusPanels?: AppPanels;
  panels?: AppShellPanels;
  /** Renders the active view; Settings is the shell's own. */
  children: (view: string) => ReactNode;
};

/**
 * What every host app mounts: `AppShell` with its manifest nav, the suite Settings view behind the rail's
 * Settings row, the shared appearance applied, and the status bar when the app has a segment to show.
 */
export function SuiteAppShell({
  app,
  name,
  accent,
  nav,
  home,
  view,
  onViewChange,
  settingsPages = [],
  segments = [],
  statusPanels = {},
  panels,
  children,
}: SuiteAppShellProps) {
  useAppearanceSync();
  const [ownView, setOwnView] = useState(home);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const current = view ?? ownView;

  const navigate = (next: string) => {
    if (next === SETTINGS_VIEW) {
      setSettingsOpen(true);
      return;
    }
    setSettingsOpen(false);
    if (onViewChange) onViewChange(next);
    else setOwnView(next);
  };

  const all = [...suiteSegments(statusPanels), ...segments];
  return (
    <AppShell
      app={app}
      name={name}
      accent={accent}
      nav={nav}
      activeView={settingsOpen ? SETTINGS_VIEW : current}
      onNavigate={navigate}
      {...(panels ? { panels } : {})}
      footer={all.length > 0 ? <StatusBar segments={all} /> : null}
    >
      {settingsOpen ? (
        <div className="h-full overflow-hidden" data-testid="suite-settings">
          <SettingsView pages={[...SUITE_APP_SETTINGS_PAGES, ...settingsPages]} />
        </div>
      ) : (
        children(current)
      )}
    </AppShell>
  );
}
