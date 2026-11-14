import { useMemo, type ReactNode } from 'react';

import { StatusBar as FrameStatusBar, StatusBarChromeProvider, useDisabledFeatures } from '@midnite/studio-frame';

import { STUDIO_STATUS_BAR_CHROME } from '../../compose/status-bar-chrome';
import { InProgressLiveRegion } from './in-progress';
import { OpProgressLiveRegion } from './op-progress';
import { segmentsFor } from './segments';

/**
 * Studio's status bar: the frame's segment host (Phase 123 Theme J) over
 * Studio's own `STATUS_SEGMENTS`, with Studio's tooltip and portalled popover,
 * and the two live regions that must survive every density.
 */
export function StatusBar({ fab = null }: { fab?: ReactNode } = {}) {
  const disabled = useDisabledFeatures();
  const segments = useMemo(() => segmentsFor(disabled), [disabled]);
  return (
    <StatusBarChromeProvider chrome={STUDIO_STATUS_BAR_CHROME}>
      <FrameStatusBar
        segments={segments}
        fab={fab}
        liveRegions={
          <>
            <OpProgressLiveRegion />
            <InProgressLiveRegion />
          </>
        }
      />
    </StatusBarChromeProvider>
  );
}
