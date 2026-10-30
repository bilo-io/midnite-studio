import { useState } from 'react';

import { ReportIssueHost } from '@midnite/studio-feature-report/renderer';
import { FrameChromeProvider, ModuleViewRouter, SuiteAppShell, type ModulePane } from '@midnite/studio-frame';
import { AGENTS_APP, AGENTS_CHROME, AgentsPane } from '@midnite/studio-module-agents/renderer';
import { CoderPane } from '@midnite/studio-module-coder/renderer';
import { CreatorPane } from '@midnite/studio-module-creator/renderer';

import { AGENTS_HOST_NAV } from './host-nav';

/** Each mounted module's pane, by module id — the view router's table. */
export const AGENTS_PANES: Readonly<Record<string, ModulePane>> = {
  agents: AgentsPane,
  coder: CoderPane,
  creator: CreatorPane,
};

/**
 * Midnite Agents as a host (Phase 124 Theme E.3): the suite shell over a rail of three module groups, and the
 * view router handing the active view to its module's pane. Agents' chrome wears the shell and the report
 * entry; each pane brings its own chrome, query client and host ports.
 */
export function AgentsHostApp() {
  const [view, setView] = useState<string>(AGENTS_APP.home);
  return (
    <FrameChromeProvider chrome={AGENTS_CHROME}>
      <SuiteAppShell
        app="agents"
        name={AGENTS_APP.name}
        accent={AGENTS_APP.accent}
        nav={AGENTS_HOST_NAV}
        home={AGENTS_APP.home}
        view={view}
        onViewChange={setView}
      >
        {(active) => <ModuleViewRouter nav={AGENTS_HOST_NAV} view={active} onView={setView} panes={AGENTS_PANES} />}
      </SuiteAppShell>
      <ReportIssueHost app="midnite-agents" />
    </FrameChromeProvider>
  );
}
