import { useState } from 'react';

import { ReportIssueHost } from '@midnite/studio-feature-report/renderer';
import { FrameChromeProvider, ModuleViewRouter, SuiteAppShell, type ModulePane } from '@midnite/studio-frame';
import { CapturePane } from '@midnite/studio-module-capture/renderer';
import { MIND_APP, MIND_CHROME, MIND_SETTINGS, MindPane } from '@midnite/studio-module-mind/renderer';

import { MIND_HOST_NAV } from './host-nav';

/** Each mounted module's pane, by module id — the view router's table. */
export const MIND_PANES: Readonly<Record<string, ModulePane>> = {
  mind: MindPane,
  capture: () => <CapturePane />,
};

/**
 * Midnite Mind as a host (Phase 124 Theme E.3): the suite shell over a rail of two module groups, Mind and
 * Capture, and the view router handing the active view to its module's pane. The shell wears the report
 * entry; each pane brings its own chrome and host ports.
 */
export function MindHostApp() {
  const [view, setView] = useState<string>(MIND_APP.home);
  return (
    <FrameChromeProvider chrome={MIND_CHROME}>
      <SuiteAppShell
        app="mind"
        name={MIND_APP.name}
        accent={MIND_APP.accent}
        nav={MIND_HOST_NAV}
        home={MIND_APP.home}
        view={view}
        onViewChange={setView}
        settingsPages={MIND_SETTINGS}
      >
        {(active) => <ModuleViewRouter nav={MIND_HOST_NAV} view={active} onView={setView} panes={MIND_PANES} />}
      </SuiteAppShell>
      <ReportIssueHost app="midnite-mind" />
    </FrameChromeProvider>
  );
}
