import { LuLoader, LuWifiOff } from 'react-icons/lu';

import { EmptyState } from '../../../components/empty-state';
import { Tooltip } from '../../../components/tooltip';
import type { MapStatus } from './use-map-status';

/** The thin progress bar at the canvas top while tiles load. */
export function MapLoadingBar({ status }: { status: Pick<MapStatus, 'loading'> }) {
  if (!status.loading) return null;
  return (
    <div role="progressbar" aria-label="Loading map tiles" className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-primary/20">
      <div className="h-full w-1/3 animate-pulse bg-primary" />
    </div>
  );
}

/** "N tiles failed" — a footer chip, tooltip naming the first failing source and its status. */
export function MapErrorChip({ status }: { status: Pick<MapStatus, 'failed' | 'firstError'> }) {
  if (status.failed === 0) return null;
  const label = `${status.failed} ${status.failed === 1 ? 'tile' : 'tiles'} failed`;
  const reason = status.firstError ? `First failure: ${status.firstError.source} (${status.firstError.status})` : 'Some tiles failed to load.';
  return (
    <Tooltip label={reason}>
      <span role="status" className="rounded-md border border-border bg-background/80 px-2 py-0.5 text-[11px] text-muted-foreground backdrop-blur-sm">
        {label}
      </span>
    </Tooltip>
  );
}

/**
 * Offline = `navigator.onLine === false`, or the style itself failed to load. Tiles already in the disk
 * cache still draw offline, so this replaces the canvas only when there is nothing to draw.
 */
export function isMapOffline(status: Pick<MapStatus, 'online' | 'styleFailed'>): boolean {
  return !status.online || status.styleFailed;
}

export function MapOfflinePanel({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={LuWifiOff}
      title="Map tiles need a network connection."
      body="Tiles already in the cache still draw offline; the rest need a connection."
      action={
        <button type="button" onClick={onRetry} className="rounded-md border border-border bg-card px-3 py-1 text-xs hover:bg-accent">
          Retry
        </button>
      }
    />
  );
}

export function MapLoadingState() {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground" role="status">
      <LuLoader aria-hidden className="h-3.5 w-3.5 animate-spin" /> Loading map…
    </div>
  );
}
