import { useVanguardUi, VanguardSettingsPage } from '@midnite/studio-feature-vanguard/renderer';
import { ReportIssueHost } from '@midnite/studio-feature-report/renderer';
import { FrameChromeProvider, SuiteAppShell, type SettingsPageDef } from '@midnite/studio-frame';
import { LuShield } from 'react-icons/lu';

import { VANGUARD_CHROME, VanguardDialogHost } from './compose/vanguard-chrome';
import { VANGUARD_APP } from './vanguard-manifest';
import { VanguardHome } from './views/vanguard-home';

/** Vanguard's own Settings page (the feature's `settingsPages`), after the suite's. */
const VANGUARD_SETTINGS: readonly SettingsPageDef[] = [
  { id: 'vanguard', label: 'Vanguard', group: 'system', scope: 'app', icon: LuShield, Page: VanguardSettingsPage },
];

/**
 * The shell's rail rows are the page's tabs (findings, sensors, network): the selected tab lives in the
 * feature's store, so the rail and the page's own tab strip are two controls over one value.
 */
function VanguardShell() {
  const tab = useVanguardUi((s) => s.tab);
  const setTab = useVanguardUi((s) => s.setTab);
  return (
    <SuiteAppShell
      app="vanguard"
      name={VANGUARD_APP.name}
      accent={VANGUARD_APP.accent}
      nav={VANGUARD_APP.nav}
      home="findings"
      view={tab}
      onViewChange={(view) => setTab(view as typeof tab)}
      settingsPages={VANGUARD_SETTINGS}
    >
      {() => <VanguardHome />}
    </SuiteAppShell>
  );
}

/**
 * Midnite Vanguard — the vanguard feature composed over the frame as its own app, inside the suite
 * shell (Phase 123 Theme H). The feature needs no host port (it owns no app state), only the frame chrome.
 */
export function VanguardApp() {
  return (
    <FrameChromeProvider chrome={VANGUARD_CHROME}>
      <VanguardShell />
      <VanguardDialogHost />
      <ReportIssueHost app="midnite-vanguard" />
    </FrameChromeProvider>
  );
}
