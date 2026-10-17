import { MediaShell } from '@midnite/studio-feature-media-core/renderer';
import { PiMonitorPlayFill } from 'react-icons/pi';

import { MEDIA_APP, MEDIA_TABS } from '../media-manifest';

/** What Media shows on open: the accent mark and name on top, the media shell with the Library below. */
export function MediaHome() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-900"
          style={{ backgroundColor: MEDIA_APP.accent }}
        >
          <PiMonitorPlayFill className="h-4 w-4" />
        </span>
        <p className="text-sm font-semibold leading-tight">{MEDIA_APP.name}</p>
        <p className="text-xs text-muted-foreground">{MEDIA_APP.tagline}</p>
      </header>
      <main className="min-h-0 flex-1" aria-label="Media">
        <MediaShell tabs={MEDIA_TABS} title="Library" />
      </main>
    </div>
  );
}
