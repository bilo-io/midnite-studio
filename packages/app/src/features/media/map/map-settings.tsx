import { MAP_CACHE_CAP_MB } from '@midnite/studio-shared';
import { useEffect, useState } from 'react';

import { useDialogs } from '../../../components/dialog-host';
import { ApiKeyRow } from '../image/image-settings';
import { useMapCache } from './use-map';

const MB = 1024 * 1024;
const formatMB = (bytes: number): string => (bytes >= 1024 * MB ? `${(bytes / (1024 * MB)).toFixed(1)} GB` : `${Math.round(bytes / MB)} MB`);

/**
 * Settings ▸ Media ▸ Maps (Phase 108 Theme B): the optional MapTiler key (which unlocks MapTiler
 * satellite, Terrain-RGB and streets) and the tile cache — size readout, cap slider in 256 MB steps, and
 * a confirmed Clear. The key goes to main's vault; this page only ever learns whether one is set.
 */
export function MapSettingsSection() {
  const dialogs = useDialogs();
  const { status, run } = useMapCache();
  const cache = status.data;
  const [cap, setCap] = useState<number>(MAP_CACHE_CAP_MB.default);
  useEffect(() => {
    if (cache) setCap(cache.capMB);
  }, [cache]);

  const clear = () =>
    dialogs.confirm({
      title: 'Clear map cache',
      body: `Clear ${cache ? formatMB(cache.bytes) : '0 MB'} of cached map tiles?`,
      confirmLabel: 'Clear',
      danger: true,
      onConfirm: () => run.mutate({ op: 'clear' }),
    });

  return (
    <div className="flex flex-col gap-4 p-3">
      <ApiKeyRow label="MapTiler" secretKey="media.mapTilerApiKey" />
      <p className="-mt-2 text-[11px] text-muted-foreground">
        Optional. Unlocks MapTiler satellite, Terrain-RGB elevation and styles. The key stays in the app's
        encrypted vault and is only ever added to a request in the main process.
      </p>
      <div className="space-y-1.5" data-testid="map-cache">
        <p className="text-xs font-medium text-foreground">Map tile cache</p>
        <p className="text-[11px] text-muted-foreground" data-testid="map-cache-readout">
          {cache ? `${formatMB(cache.bytes)} in ${cache.tiles.toLocaleString()} tiles` : 'Not available'}
        </p>
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          Cap
          <input
            type="range"
            aria-label="Map cache size limit"
            min={MAP_CACHE_CAP_MB.min}
            max={MAP_CACHE_CAP_MB.max}
            step={MAP_CACHE_CAP_MB.step}
            value={cap}
            onChange={(event) => setCap(Number(event.target.value))}
            onPointerUp={() => run.mutate({ op: 'set-cap', capMB: cap })}
            onKeyUp={() => run.mutate({ op: 'set-cap', capMB: cap })}
            className="flex-1"
          />
          <span className="w-16 text-right tabular-nums text-foreground">{cap >= 1024 ? `${(cap / 1024).toFixed(2).replace(/\.?0+$/, '')} GB` : `${cap} MB`}</span>
        </label>
        <button
          type="button"
          onClick={clear}
          disabled={!cache || cache.bytes === 0 || run.isPending}
          className="rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-50"
        >
          Clear map cache
        </button>
      </div>
    </div>
  );
}
