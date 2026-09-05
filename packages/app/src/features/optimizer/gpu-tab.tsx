import { useEffect, useState } from 'react';

import { CHART_GEOMETRY } from '../monitor/metric-geometry';
import { MetricChart } from '../monitor/metric-chart';
import type { MetricPoint } from '../../store/metrics-store';
import { useOptimizerStore } from '../../store/optimizer-store';
import { formatBytes } from '../monitor/format-bytes';
import { loadOptimizerGpu } from './use-optimizer';

/** The rolling window the chart shows. */
const GPU_CHART_WINDOW_MS = 60_000;
/**
 * Its own cadence, gated to when this tab is visible — not the footer's 2s
 * metrics tick. A full `getGPUInfo` + probe round trip every 2s is heavier
 * than this tab's own reading needs, and nothing here runs while another tab
 * is showing.
 */
const GPU_POLL_MS = 5_000;

export function GpuTab() {
  const gpu = useOptimizerStore((s) => s.gpu);
  const [points, setPoints] = useState<MetricPoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadOptimizerGpu();
    const interval = setInterval(() => {
      if (!cancelled) void loadOptimizerGpu();
    }, GPU_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (gpu?.loadPercent === null || gpu?.loadPercent === undefined) return;
    const at = Date.now();
    setPoints((prev) => {
      const cutoff = at - GPU_CHART_WINDOW_MS;
      const kept = prev.filter((point) => point.at >= cutoff);
      return [...kept, { value: gpu.loadPercent as number, at }];
    });
  }, [gpu?.loadPercent]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-border p-3">
        <p className="text-sm font-medium text-foreground">{gpu?.model ?? 'Unknown GPU'}</p>
        <p className="text-xs text-muted-foreground">
          {gpu?.vramBytes !== null && gpu?.vramBytes !== undefined
            ? `${formatBytes(gpu.vramBytes)} VRAM`
            : 'VRAM unreported on this machine'}
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Load, last 60s</p>
        <MetricChart
          label="GPU load, last 60 seconds"
          geometry={CHART_GEOMETRY}
          series={[{ id: 'gpu', points }]}
        />
      </div>

      <div className="space-y-2 rounded-md border border-border/60 bg-card/50 p-3">
        <p className="text-xs font-medium text-foreground">Tweak Settings</p>
        {['Prefer integrated GPU', 'Disable GPU acceleration for terminals'].map((label) => (
          <label key={label} className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" disabled className="h-3.5 w-3.5" />
            {label} <span className="italic">— not wired yet</span>
          </label>
        ))}
      </div>
    </div>
  );
}
