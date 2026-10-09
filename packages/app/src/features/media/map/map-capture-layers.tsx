import type { MapCaptureStage } from '@midnite/studio-shared';
import { LuCircleCheck, LuCircleX, LuClock, LuLoaderCircle } from 'react-icons/lu';

export type MapLayerExportId = 'dem' | 'satellite' | 'roads' | 'buildings';

export type MapLayerExportDef = {
  id: MapLayerExportId;
  label: string;
};

export type LayerExportStatus = 'pending' | 'running' | 'completed' | 'error';

/**
 * Status icon for an exporting layer in Media ▸ Map.
 * Matches git CI actions status indicators:
 * - Pending: orange clock icon (`LuClock` in `text-amber-500`)
 * - Running: circular spinner (`LuLoaderCircle` with `animate-spin text-amber-500`)
 * - Completed: green checkmark (`LuCircleCheck` in `text-success`)
 * - Error: red cross (`LuCircleX` in `text-destructive`)
 */
export function LayerStatusIcon({ status }: { status: LayerExportStatus }) {
  switch (status) {
    case 'pending':
      return <LuClock className="size-3.5 shrink-0 text-amber-500" aria-label="Pending" />;
    case 'running':
      return <LuLoaderCircle className="size-3.5 shrink-0 animate-spin text-amber-500" aria-label="Exporting" />;
    case 'completed':
      return <LuCircleCheck className="size-3.5 shrink-0 text-success" aria-label="Completed" />;
    case 'error':
      return <LuCircleX className="size-3.5 shrink-0 text-destructive" aria-label="Failed" />;
  }
}

export function getExportLayerStatus({
  layerId,
  phase,
  currentStage,
  failedStage,
  missingSlots = [],
}: {
  layerId: MapLayerExportId;
  phase: 'idle' | 'running' | 'done' | 'failed';
  currentStage?: MapCaptureStage;
  failedStage?: MapCaptureStage;
  missingSlots?: string[];
}): LayerExportStatus {
  if (phase === 'running') {
    const stage = currentStage ?? 'plan';
    if (layerId === 'dem') {
      if (stage === 'plan' || stage === 'dem' || stage === 'encode') return 'running';
      return 'completed';
    }
    if (layerId === 'satellite') {
      if (stage === 'plan' || stage === 'dem' || stage === 'encode') return 'pending';
      if (stage === 'satellite') return 'running';
      return 'completed';
    }
    if (layerId === 'roads') {
      if (stage === 'roads') return 'running';
      if (stage === 'handoff' || (stage as string) === 'buildings') return 'completed';
      return 'pending';
    }
    if (layerId === 'buildings') {
      if ((stage as string) === 'buildings') return 'running';
      if (stage === 'handoff') return 'completed';
      return 'pending';
    }
  }

  if (phase === 'done') {
    if (layerId === 'dem') return 'completed';
    if (missingSlots.includes(layerId)) return 'error';
    return 'completed';
  }

  if (phase === 'failed') {
    const stage = failedStage ?? 'plan';
    if (layerId === 'dem') {
      if (stage === 'plan' || stage === 'dem' || stage === 'encode') return 'error';
      return 'completed';
    }
    if (layerId === 'satellite') {
      if (stage === 'plan' || stage === 'dem' || stage === 'encode') return 'pending';
      if (stage === 'satellite') return 'error';
      return 'completed';
    }
    if (layerId === 'roads') {
      if (stage === 'roads') return 'error';
      if (stage === 'handoff' || (stage as string) === 'buildings') return 'completed';
      return 'pending';
    }
    if (layerId === 'buildings') {
      if ((stage as string) === 'buildings') return 'error';
      if (stage === 'handoff') return 'completed';
      return 'pending';
    }
  }

  return 'pending';
}

export function ExportLayersList({
  layers,
  getStatus,
}: {
  layers: MapLayerExportDef[];
  getStatus: (id: MapLayerExportId) => LayerExportStatus;
}) {
  if (layers.length === 0) return null;

  return (
    <div className="space-y-1.5 rounded border border-border bg-muted/30 p-2" data-testid="map-export-layers">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Export layers</div>
      <ul className="space-y-1" role="list">
        {layers.map((layer) => {
          const status = getStatus(layer.id);
          return (
            <li
              key={layer.id}
              data-testid={`layer-export-${layer.id}`}
              data-status={status}
              className="flex items-center gap-2 text-[12px]"
            >
              <span data-testid={`layer-icon-${layer.id}`}>
                <LayerStatusIcon status={status} />
              </span>
              <span className="truncate">{layer.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
