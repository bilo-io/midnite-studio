import { useMemo, type ReactNode } from 'react';

import { StatusBarChromeProvider, TitleBarHostProvider, type TitleBarHost } from '@midnite/studio-frame';

import { useUiStore } from '../store/ui-store';
import { STUDIO_STATUS_BAR_CHROME } from './status-bar-chrome';

/**
 * Fills the frame's title-bar cluster with Studio's settings (Phase 123 Theme J.4): the metrics idle
 * cadence and the privacy switches the weather fetch honours, from `ui-store`, and Studio's own portalled
 * popover for the status pill and the battery.
 */
export function StudioTitleBarHost({ children }: { children: ReactNode }) {
  const metricsIdleIntervalMs = useUiStore((s) => s.metricsIdleIntervalMs);
  const locateByIpEnabled = useUiStore((s) => s.locateByIpEnabled);
  const allAutomaticOff = useUiStore((s) => s.egressAllAutomaticOff);
  const switches = useUiStore((s) => s.egressSwitches);
  const host = useMemo<TitleBarHost>(
    () => ({ metricsIdleIntervalMs, locateByIpEnabled, egress: { allAutomaticOff, switches } }),
    [metricsIdleIntervalMs, locateByIpEnabled, allAutomaticOff, switches],
  );
  return (
    <StatusBarChromeProvider chrome={STUDIO_STATUS_BAR_CHROME}>
      <TitleBarHostProvider host={host}>{children}</TitleBarHostProvider>
    </StatusBarChromeProvider>
  );
}
