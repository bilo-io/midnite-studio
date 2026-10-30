import { MediaShell, useActiveMediaTab } from '@midnite/studio-feature-media-core/renderer';
import { SuiteAppShell } from '@midnite/studio-frame';

import { MEDIA_APP, MEDIA_TABS } from '../media-manifest';

/**
 * Media inside the suite shell (Phase 123 Theme H): the rail's rows are the media tabs, selected through
 * the same host value the shell's own strip used, which `bare` drops.
 */
export function MediaHome() {
  const [tab, setTab] = useActiveMediaTab(MEDIA_TABS);
  return (
    <SuiteAppShell
      app="media"
      name={MEDIA_APP.name}
      accent={MEDIA_APP.accent}
      nav={MEDIA_APP.nav}
      home={MEDIA_APP.home}
      view={tab}
      onViewChange={setTab}
    >
      {() => (
        <main className="h-full min-h-0" aria-label="Media">
          <MediaShell tabs={MEDIA_TABS} title="Library" bare />
        </main>
      )}
    </SuiteAppShell>
  );
}
