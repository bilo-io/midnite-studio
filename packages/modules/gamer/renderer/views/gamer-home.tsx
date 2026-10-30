import { MediaShell, useActiveMediaTab } from '@midnite/studio-feature-media-core/renderer';
import { SuiteAppShell } from '@midnite/studio-frame';

import { GAMER_APP, GAMER_TABS } from '../gamer-manifest';

/**
 * Gamer inside the suite shell (Phase 123 Theme H): the rail's rows are the media tabs, selected through
 * the same host value the shell's own strip used, which `bare` drops.
 */
export function GamerHome() {
  const [tab, setTab] = useActiveMediaTab(GAMER_TABS);
  return (
    <SuiteAppShell
      app="gamer"
      name={GAMER_APP.name}
      accent={GAMER_APP.accent}
      nav={GAMER_APP.nav}
      home={GAMER_APP.home}
      view={tab}
      onViewChange={setTab}
    >
      {() => (
        <main className="h-full min-h-0" aria-label="Media">
          <MediaShell tabs={GAMER_TABS} bare />
        </main>
      )}
    </SuiteAppShell>
  );
}
