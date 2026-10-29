import { MediaShell } from '@midnite/studio-feature-media-core/renderer';
import { PiPaletteFill } from 'react-icons/pi';

import { creatorManifest } from '../../manifest';
import { CREATOR_TABS } from '../creator-tabs';

/** What Creator shows on open: the accent mark and name on top, the media shell with its tabs below. */
export function CreatorHome() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: creatorManifest.accent }}
        >
          <PiPaletteFill className="h-4 w-4" />
        </span>
        <p className="text-sm font-semibold leading-tight">Midnite Creator</p>
        <p className="text-xs text-muted-foreground">Docs and images, every asset a file</p>
      </header>
      <main className="min-h-0 flex-1" aria-label="Media">
        <MediaShell tabs={CREATOR_TABS} />
      </main>
    </div>
  );
}
