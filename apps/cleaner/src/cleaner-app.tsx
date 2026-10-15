import { useState } from 'react';

import { FrameChromeProvider } from '@midnite/studio-frame';
import { OptimizerHostProvider, type OptimizerHost } from '@midnite/studio-feature-optimizer/renderer';

import { CLEANER_CHROME, CleanerDialogHost } from './compose/cleaner-chrome';
import { createCleanerHost } from './compose/cleaner-host';
import { CleanerHome } from './views/cleaner-home';

/**
 * Midnite Cleaner — the optimizer feature composed over the frame as its own
 * app. Installs the two ports the feature needs (frame chrome, optimizer host)
 * and mounts the home view plus the confirm-dialog host.
 */
export function CleanerApp({ host }: { host?: OptimizerHost }) {
  const [ownHost] = useState(() => host ?? createCleanerHost());
  return (
    <FrameChromeProvider chrome={CLEANER_CHROME}>
      <OptimizerHostProvider host={host ?? ownHost}>
        <CleanerHome />
        <CleanerDialogHost />
      </OptimizerHostProvider>
    </FrameChromeProvider>
  );
}
