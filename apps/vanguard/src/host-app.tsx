import { useState } from 'react';

import { ReportIssueHost } from '@midnite/studio-feature-report/renderer';
import { FrameChromeProvider, ModuleViewRouter, SuiteAppShell, type ModulePane } from '@midnite/studio-frame';
import { CleanerPane } from '@midnite/studio-module-cleaner/renderer';
import { MonitorPane } from '@midnite/studio-module-monitor/renderer';
import { VANGUARD_APP, VANGUARD_CHROME, VANGUARD_SETTINGS, VanguardPane } from '@midnite/studio-module-vanguard/renderer';
import { VaultPane } from '@midnite/studio-module-vault/renderer';

import { VANGUARD_HOST_NAV } from './host-nav';

/** Each mounted module's pane, by module id — the view router's table. */
export const VANGUARD_PANES: Readonly<Record<string, ModulePane>> = {
  vanguard: VanguardPane,
  vault: () => <VaultPane />,
  cleaner: () => <CleanerPane />,
  monitor: () => <MonitorPane />,
};

/**
 * Midnite Vanguard as a host (Phase 124 Theme E.3): the suite shell over a rail of four module groups, and
 * the view router handing the active view to its module's pane. Vanguard's chrome wears the shell and the
 * report entry; each pane brings its own chrome and host port.
 */
export function VanguardHostApp() {
  const [view, setView] = useState<string>(VANGUARD_APP.nav.views[0]?.id ?? 'findings');
  return (
    <FrameChromeProvider chrome={VANGUARD_CHROME}>
      <SuiteAppShell
        app="vanguard"
        name={VANGUARD_APP.name}
        accent={VANGUARD_APP.accent}
        nav={VANGUARD_HOST_NAV}
        home="findings"
        view={view}
        onViewChange={setView}
        settingsPages={VANGUARD_SETTINGS}
      >
        {(active) => <ModuleViewRouter nav={VANGUARD_HOST_NAV} view={active} onView={setView} panes={VANGUARD_PANES} />}
      </SuiteAppShell>
      <ReportIssueHost app="midnite-vanguard" />
    </FrameChromeProvider>
  );
}
