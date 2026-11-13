import { useState } from 'react';

import { createSuiteMonitorSegment } from '@midnite/studio-feature-monitor/renderer';
import { ReportIssueHost } from '@midnite/studio-feature-report/renderer';
import { FrameChromeProvider, ModuleViewRouter, SuiteAppShell, type ModulePane } from '@midnite/studio-frame';
import { SCIENCE_APP, SCIENCE_CHROME, SciencePane } from '@midnite/studio-module-science/renderer';
import { SimulatorPane } from '@midnite/studio-module-simulator/renderer';

import { SCIENCE_HOST_NAV } from './host-nav';

/** The status bar's monitor segment: "Open Monitor" leaves for the launcher, which routes it to the host that carries Monitor. */
const MONITOR_SEGMENT = createSuiteMonitorSegment({ hosted: new Set(['science']) });

/** Each mounted module's pane, by module id — the view router's table. */
export const SCIENCE_PANES: Readonly<Record<string, ModulePane>> = {
  science: SciencePane,
  simulator: SimulatorPane,
};

/**
 * Midnite Science as a host (Phase 126 Theme A.4): the suite shell over a rail of module groups and the view
 * router handing the active view to its module's pane. The shell wears the report entry; each pane brings its
 * own chrome.
 */
export function ScienceHostApp() {
  const [view, setView] = useState<string>(SCIENCE_APP.home);
  return (
    <FrameChromeProvider chrome={SCIENCE_CHROME}>
      <SuiteAppShell
        app="science"
        name={SCIENCE_APP.name}
        accent={SCIENCE_APP.accent}
        nav={SCIENCE_HOST_NAV}
        home={SCIENCE_APP.home}
        view={view}
        onViewChange={setView}
        statusPanels={{ monitor: MONITOR_SEGMENT }}
      >
        {(active) => <ModuleViewRouter nav={SCIENCE_HOST_NAV} view={active} onView={setView} panes={SCIENCE_PANES} />}
      </SuiteAppShell>
      <ReportIssueHost app="midnite-science" />
    </FrameChromeProvider>
  );
}
