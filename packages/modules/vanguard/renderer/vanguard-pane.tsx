import { useVanguardUi, VanguardSettingsPage } from '@midnite/studio-feature-vanguard/renderer';
import { FrameChromeProvider, useSyncedView, type SettingsPageDef } from '@midnite/studio-frame';
import { LuShield } from 'react-icons/lu';

import { VANGUARD_CHROME, VanguardDialogHost } from './compose/vanguard-chrome';
import { VanguardHome } from './views/vanguard-home';

/** Vanguard's own Settings page (the feature's `settingsPages`), after the suite's. */
export const VANGUARD_SETTINGS: readonly SettingsPageDef[] = [
  { id: 'vanguard', label: 'Vanguard', group: 'system', scope: 'app', icon: LuShield, Page: VanguardSettingsPage },
];

/**
 * Vanguard as a pane inside a host's shell (Phase 124 Theme E.3). The rail rows are the page's tabs, and the
 * selected tab lives in the feature's store, so the rail and the page's own tab strip stay one value
 * (`useSyncedView`).
 */
export function VanguardPane({ view, onView }: { view: string; onView: (view: string) => void }) {
  const tab = useVanguardUi((s) => s.tab);
  const setTab = useVanguardUi((s) => s.setTab);
  useSyncedView(view, onView, tab, (next) => setTab(next as typeof tab));
  return (
    <FrameChromeProvider chrome={VANGUARD_CHROME}>
      <VanguardHome />
      <VanguardDialogHost />
    </FrameChromeProvider>
  );
}
