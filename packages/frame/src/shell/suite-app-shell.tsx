import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { LuActivity, LuKeyboard, LuPalette } from 'react-icons/lu';
import type { SuiteAppId } from '@midnite/studio-shared';

import { bridge } from '../bridge';
import type { CommandRuntime } from '../commands/command-runtime';
import { useKeybindings } from '../commands/use-keybindings';
import { useAppearanceSync } from '../prefs/appearance-store';
import { ChordsPage } from '../settings/chords-page';
import { CHORDS_PAGE_ID, type SettingsPageDef } from '../settings/settings-pages';
import { SettingsView } from '../settings/settings-view';
import { SuiteAppearancePage } from '../settings/suite-appearance-page';
import { SuiteMonitorPage } from '../settings/suite-monitor-page';
import { AppShell, type AppShellPanels } from './app-shell';
import { landingView, SETTINGS_VIEW, type NavConfig } from './nav-config';
import { StatusBar } from './status-bar/status-bar';
import type { StatusSegment } from './status-bar/segments';
import { suiteSegments, type AppPanels } from './status-bar/suite-segments';

/**
 * The suite pages a non-Studio app can show today (Phase 123 Theme H): Appearance and the read-only chord
 * table, plus Monitor when the app's status bar has a monitor segment ({@link suiteAppSettingsPages}).
 * Privacy, Terminal and Companion are still Studio's (`packages/app`, on its `ui-store`): each one
 * configures something an app's main enforces or a panel an app has, so it joins with that.
 */
export const SUITE_APP_SETTINGS_PAGES: readonly SettingsPageDef[] = [
  { id: 'appearance', label: 'Appearance', group: 'general', scope: 'suite', icon: LuPalette, Page: SuiteAppearancePage },
  { id: CHORDS_PAGE_ID, label: 'Keyboard shortcuts', group: 'general', scope: 'suite', icon: LuKeyboard, Page: ChordsPage },
];

const MONITOR_PAGE: SettingsPageDef = {
  id: 'monitor',
  label: 'Monitor',
  group: 'system',
  scope: 'suite',
  icon: LuActivity,
  Page: SuiteMonitorPage,
};

/**
 * The suite pages for an app that offers `statusPanels`. A page that configures a status segment is
 * left out when the app's bar does not have that segment, so Settings never lists a switch with nothing
 * to switch. Order follows `SUITE_SETTINGS_PAGES`: Appearance, Monitor, then the chord table.
 */
export function suiteAppSettingsPages(statusPanels: AppPanels = {}): SettingsPageDef[] {
  const [appearance, chords] = SUITE_APP_SETTINGS_PAGES as [SettingsPageDef, SettingsPageDef];
  return [appearance, ...(statusPanels.monitor ? [MONITOR_PAGE] : []), chords];
}

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
  /** Told whenever Settings opens or closes — an app with native views over the DOM hides them while it is open. */
  onSettingsOpenChange?: (open: boolean) => void;
  /**
   * Keep the active view mounted, hidden, while Settings is open, instead of unmounting it. For a view that holds
   * state or native surfaces a remount would lose — Browser's tabs and its agent-session event stream. The
   * hidden view keeps its layout box (`visibility`, never `display: none`), so anything measuring it sees no resize.
   */
  keepViewMounted?: boolean;
  /**
   * Renders the active view; Settings is the shell's own.
   *
   * No `panels` and no terminal, companion or FAB segment are offered here yet (Phase 123 Theme H): a suite app
   * has no pty host (the broker script, `node-pty`, confinement and the agent probe live in `packages/desktop`;
   * an app can only attach to Studio's broker as a guest, which cannot create a session), the companion needs
   * Studio's dispatch, agents and utility fork, and the FAB starts a loop in the terminal. Each joins with the
   * host it needs, never as a button that does nothing.
   */
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
  onSettingsOpenChange,
  keepViewMounted = false,
  children,
}: SuiteAppShellProps) {
  useAppearanceSync();
  const [ownView, setOwnView] = useState(home);
  const [settingsOpen, setSettingsOpenState] = useState(false);
  const setSettingsOpen = useCallback(
    (open: boolean) => {
      setSettingsOpenState(open);
      onSettingsOpenChange?.(open);
    },
    [onSettingsOpenChange],
  );
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

  // A launcher link (`midnite://open?app=…&module=…&view=…`) lands the host on that module and view: the one
  // that started it (taken once on mount) and any that reach it running (pushed). Unknown ids change nothing.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  useEffect(() => {
    const link = bridge()?.suiteLink;
    if (link === undefined) return undefined;
    const land = (landing: { module?: string | undefined; view?: string | undefined }) => {
      const target = landingView(nav, landing);
      if (target !== undefined) navigateRef.current(target);
    };
    const off = link.onOpen(land);
    void link.take().then((landing) => {
      if (landing !== null) land(landing);
    }, () => undefined);
    return off;
  }, [nav]);

  // `Mod+,` opens Settings (`view.settings`) in every suite app; only that command is this runtime's.
  const runtime = useMemo<CommandRuntime>(
    () => ({ 'view.settings': { enabled: true, run: () => setSettingsOpen(true) } }),
    [setSettingsOpen],
  );
  useKeybindings(runtime);

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
      {keepViewMounted ? (
        <div
          className={settingsOpen ? 'invisible h-full' : 'h-full'}
          aria-hidden={settingsOpen || undefined}
          inert={settingsOpen || undefined}
          data-testid="suite-view"
        >
          {children(current)}
        </div>
      ) : settingsOpen ? null : (
        children(current)
      )}
      {settingsOpen ? (
        <div className={keepViewMounted ? 'absolute inset-0 overflow-hidden bg-background' : 'h-full overflow-hidden'} data-testid="suite-settings">
          <SettingsView pages={[...suiteAppSettingsPages(statusPanels), ...settingsPages]} />
        </div>
      ) : null}
    </AppShell>
  );
}
