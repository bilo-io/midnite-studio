import { useState } from 'react';

import { OptimizerHostProvider } from '@midnite/studio-feature-optimizer/renderer';
import { FrameChromeProvider } from '@midnite/studio-frame';

import { CLEANER_CHROME, CleanerDialogHost } from './compose/cleaner-chrome';
import { createCleanerHost } from './compose/cleaner-host';
import { CleanerHome } from './views/cleaner-home';

/**
 * Cleaner as a pane inside a host's shell (Phase 124 Theme E.3). Its header stays: it carries the settings
 * toggle (trash safety, optimizer), which has no other home in a host.
 */
export function CleanerPane() {
  const [host] = useState(() => createCleanerHost());
  return (
    <FrameChromeProvider chrome={CLEANER_CHROME}>
      <OptimizerHostProvider host={host}>
        <CleanerHome />
        <CleanerDialogHost />
      </OptimizerHostProvider>
    </FrameChromeProvider>
  );
}
