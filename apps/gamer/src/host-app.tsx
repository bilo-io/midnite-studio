import { useState } from 'react';

import { ReportIssueHost } from '@midnite/studio-feature-report/renderer';
import { FrameChromeProvider, ModuleViewRouter, SuiteAppShell, type ModulePane } from '@midnite/studio-frame';
import { CreatorPane } from '@midnite/studio-module-creator/renderer';
import { GAMER_APP, GAMER_CHROME, GamerPane } from '@midnite/studio-module-gamer/renderer';

import { GAMER_HOST_NAV } from './host-nav';

/** Each mounted module's pane, by module id — the view router's table. */
export const GAMER_PANES: Readonly<Record<string, ModulePane>> = {
  gamer: GamerPane,
  creator: CreatorPane,
};

/**
 * Midnite Gamer as a host (Phase 124 Theme E.3): the suite shell over a rail of two module groups, and the
 * view router handing the active view to its module's pane. Gamer's chrome wears the shell and the report
 * entry; each pane brings its own chrome, query client and host ports.
 */
export function GamerHostApp() {
  const [view, setView] = useState<string>(GAMER_HOST_NAV.views[0]?.id ?? 'game');
  return (
    <FrameChromeProvider chrome={GAMER_CHROME}>
      <SuiteAppShell
        app="gamer"
        name={GAMER_APP.name}
        accent={GAMER_APP.accent}
        nav={GAMER_HOST_NAV}
        home={view}
        view={view}
        onViewChange={setView}
      >
        {(active) => <ModuleViewRouter nav={GAMER_HOST_NAV} view={active} onView={setView} panes={GAMER_PANES} />}
      </SuiteAppShell>
      <ReportIssueHost app="midnite-gamer" />
    </FrameChromeProvider>
  );
}
