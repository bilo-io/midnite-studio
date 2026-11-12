import { useState } from 'react';

import { createSuiteMonitorSegment } from '@midnite/studio-feature-monitor/renderer';
import { ReportIssueHost } from '@midnite/studio-feature-report/renderer';
import { FrameChromeProvider, ModuleViewRouter, SuiteAppShell, type ModulePane } from '@midnite/studio-frame';
import { AccountantPane } from '@midnite/studio-module-accountant/renderer';
import { MONEY_APP, MONEY_CHROME, MoneyPane } from '@midnite/studio-module-money/renderer';

import { MONEY_HOST_NAV } from './host-nav';

/** The status bar's monitor segment: "Open Monitor" leaves for the launcher, which routes it to the host that carries Monitor. */
const MONITOR_SEGMENT = createSuiteMonitorSegment({ hosted: new Set(['money']) });

/** Each mounted module's pane, by module id — the view router's table. */
export const MONEY_PANES: Readonly<Record<string, ModulePane>> = {
  money: () => <MoneyPane />,
  accountant: AccountantPane,
};

/**
 * Midnite Money as a host (Phase 129 Theme A): the suite shell over a rail of two module groups, Money and
 * Accountant, and the view router handing the active view to its module's pane. The shell wears the report
 * entry; each pane brings its own chrome and host ports.
 */
export function MoneyHostApp() {
  const [view, setView] = useState<string>(MONEY_APP.home);
  return (
    <FrameChromeProvider chrome={MONEY_CHROME}>
      <SuiteAppShell
        app="money"
        name={MONEY_APP.name}
        accent={MONEY_APP.accent}
        nav={MONEY_HOST_NAV}
        home={MONEY_APP.home}
        view={view}
        onViewChange={setView}
        statusPanels={{ monitor: MONITOR_SEGMENT }}
      >
        {(active) => <ModuleViewRouter nav={MONEY_HOST_NAV} view={active} onView={setView} panes={MONEY_PANES} />}
      </SuiteAppShell>
      <ReportIssueHost app="midnite-money" />
    </FrameChromeProvider>
  );
}
