import { useState } from 'react';

import { createSuiteMonitorSegment } from '@midnite/studio-feature-monitor/renderer';
import { ReportIssueHost } from '@midnite/studio-feature-report/renderer';
import { FrameChromeProvider, ModuleViewRouter, SuiteAppShell, type ModulePane } from '@midnite/studio-frame';
import { AccountantPane } from '@midnite/studio-module-accountant/renderer';
import { STARTUP_APP, STARTUP_CHROME, STARTUP_SETTINGS, StartupPane } from '@midnite/studio-module-startup/renderer';

import { STARTUP_HOST_NAV } from './host-nav';

/** The status bar's monitor segment: "Open Monitor" leaves for the launcher, which routes it to the host that carries Monitor. */
const MONITOR_SEGMENT = createSuiteMonitorSegment({ hosted: new Set() });

/** Each mounted module's pane, by module id — the view router's table. */
export const STARTUP_PANES: Readonly<Record<string, ModulePane>> = {
  startup: StartupPane,
  accountant: AccountantPane,
};

/**
 * Midnite Startup as a host (Phase 130 Theme A): the suite shell over a rail of one module group, and the view
 * router handing the active view to its module's pane. The shell wears the report entry; each pane brings its
 * own chrome and host ports.
 */
export function StartupHostApp() {
  const [view, setView] = useState<string>(STARTUP_APP.home);
  return (
    <FrameChromeProvider chrome={STARTUP_CHROME}>
      <SuiteAppShell
        app="startup"
        name={STARTUP_APP.name}
        accent={STARTUP_APP.accent}
        nav={STARTUP_HOST_NAV}
        home={STARTUP_APP.home}
        view={view}
        onViewChange={setView}
        statusPanels={{ monitor: MONITOR_SEGMENT }}
        settingsPages={STARTUP_SETTINGS}
      >
        {(active) => <ModuleViewRouter nav={STARTUP_HOST_NAV} view={active} onView={setView} panes={STARTUP_PANES} />}
      </SuiteAppShell>
      <ReportIssueHost app="midnite-startup" />
    </FrameChromeProvider>
  );
}
