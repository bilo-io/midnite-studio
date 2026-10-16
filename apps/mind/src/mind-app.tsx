import { FrameChromeProvider } from '@midnite/studio-frame';
import { NotesHostProvider } from '@midnite/studio-feature-notes/renderer';

import { MIND_CHROME, MindDialogHost } from './compose/mind-chrome';
import { MIND_HOST } from './compose/mind-host';
import { MindHome } from './views/mind-home';

/**
 * Midnite Mind — the notes feature composed over the frame as its own app:
 * the frame chrome, and the notes host port Mind implements (`compose/mind-host.tsx`).
 */
export function MindApp() {
  return (
    <FrameChromeProvider chrome={MIND_CHROME}>
      <NotesHostProvider host={MIND_HOST}>
        <MindHome />
      </NotesHostProvider>
      <MindDialogHost />
    </FrameChromeProvider>
  );
}
