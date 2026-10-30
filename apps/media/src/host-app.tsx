import { useState } from 'react';

import { createSuiteMonitorSegment } from '@midnite/studio-feature-monitor/renderer';
import { ReportIssueHost } from '@midnite/studio-feature-report/renderer';
import { FrameChromeProvider, ModuleViewRouter, SuiteAppShell, type ModulePane } from '@midnite/studio-frame';
import { CreatorPane } from '@midnite/studio-module-creator/renderer';
import { MEDIA_APP, MEDIA_CHROME, MediaPane } from '@midnite/studio-module-media/renderer';

import { MEDIA_HOST_NAV } from './host-nav';

/** The status bar's monitor segment: "Open Monitor" leaves for the launcher, which routes it to the host that carries Monitor. */
const MONITOR_SEGMENT = createSuiteMonitorSegment({ hosted: new Set(['media']) });

/** Each mounted module's pane, by module id — the view router's table. */
export const MEDIA_PANES: Readonly<Record<string, ModulePane>> = {
  media: MediaPane,
  creator: CreatorPane,
};

/**
 * Midnite Media as a host (Phase 124 Theme E.3): the suite shell over a rail of two module groups, and the
 * view router handing the active view to its module's pane. Media's chrome wears the shell and the report
 * entry; each pane brings its own chrome, query client and host ports.
 */
export function MediaHostApp() {
  const [view, setView] = useState<string>(MEDIA_HOST_NAV.views[0]?.id ?? 'library');
  return (
    <FrameChromeProvider chrome={MEDIA_CHROME}>
      <SuiteAppShell
        app="media"
        name={MEDIA_APP.name}
        accent={MEDIA_APP.accent}
        nav={MEDIA_HOST_NAV}
        home={view}
        view={view}
        onViewChange={setView}
        statusPanels={{ monitor: MONITOR_SEGMENT }}
      >
        {(active) => <ModuleViewRouter nav={MEDIA_HOST_NAV} view={active} onView={setView} panes={MEDIA_PANES} />}
      </SuiteAppShell>
      <ReportIssueHost app="midnite-media" />
    </FrameChromeProvider>
  );
}
