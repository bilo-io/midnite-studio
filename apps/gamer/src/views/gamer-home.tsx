import { MediaShell } from '@midnite/studio-feature-media-core/renderer';
import { PiGameControllerFill } from 'react-icons/pi';

import { GAMER_APP, GAMER_TABS } from '../gamer-manifest';

/** What Gamer shows on open: the accent mark and name on top, the media shell with its tabs below. */
export function GamerHome() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: GAMER_APP.accent }}
        >
          <PiGameControllerFill className="h-4 w-4" />
        </span>
        <p className="text-sm font-semibold leading-tight">{GAMER_APP.name}</p>
        <p className="text-xs text-muted-foreground">{GAMER_APP.tagline}</p>
      </header>
      <main className="min-h-0 flex-1" aria-label="Media">
        <MediaShell tabs={GAMER_TABS} />
      </main>
    </div>
  );
}
