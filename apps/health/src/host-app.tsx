import { useState } from 'react';

import { createSuiteMonitorSegment } from '@midnite/studio-feature-monitor/renderer';
import { ReportIssueHost } from '@midnite/studio-feature-report/renderer';
import { FrameChromeProvider, ModuleViewRouter, SuiteAppShell, type ModulePane } from '@midnite/studio-frame';
import { HEALTH_APP, HEALTH_CHROME, HealthPane } from '@midnite/studio-module-health/renderer';

import { HEALTH_HOST_NAV } from './host-nav';

/** The status bar's monitor segment: "Open Monitor" leaves for the launcher, which routes it to the host that carries Monitor. */
const MONITOR_SEGMENT = createSuiteMonitorSegment({ hosted: new Set(['health']) });

/** Each mounted module's pane, by module id — the view router's table. */
export const HEALTH_PANES: Readonly<Record<string, ModulePane>> = {
  health: HealthPane,
};

/**
 * Midnite Health as a host (Phase 128 Theme A.4): the suite shell over a rail of module groups and the view
 * router handing the active view to its module's pane. The shell wears the report entry; each pane brings its
 * own chrome.
 */
export function HealthHostApp() {
  const [view, setView] = useState<string>(HEALTH_APP.home);
  return (
    <FrameChromeProvider chrome={HEALTH_CHROME}>
      <SuiteAppShell
        app="health"
        name={HEALTH_APP.name}
        accent={HEALTH_APP.accent}
        nav={HEALTH_HOST_NAV}
        home={HEALTH_APP.home}
        view={view}
        onViewChange={setView}
        statusPanels={{ monitor: MONITOR_SEGMENT }}
      >
        {(active) => <ModuleViewRouter nav={HEALTH_HOST_NAV} view={active} onView={setView} panes={HEALTH_PANES} />}
      </SuiteAppShell>
      <ReportIssueHost app="midnite-health" />
    </FrameChromeProvider>
  );
}
