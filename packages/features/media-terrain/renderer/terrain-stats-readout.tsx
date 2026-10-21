import type { TerrainStats } from '@midnite/studio-shared';

/**
 * The detail column's numbers for the last build: counts, build time, height span and (when the viewport
 * reports it) the live frame time, which is the figure Theme K records. Warnings follow in amber.
 */
export function TerrainStatsReadout({ stats, frameMs }: { stats: TerrainStats; frameMs?: number | null }) {
  const rows: Array<[string, string]> = [
    ['Vertices', stats.vertexCount.toLocaleString()],
    ['Triangles', stats.triangleCount.toLocaleString()],
    ['Chunks', `${stats.chunkCount} · ${stats.lodCount} LODs`],
    ['Built in', `${stats.buildMs.toLocaleString()} ms`],
    ['Min height', `${stats.minHeight.toFixed(1)} m`],
    ['Max height', `${stats.maxHeight.toFixed(1)} m`],
    ['Frame', frameMs ? `${frameMs.toFixed(1)} ms` : '—'],
  ];
  return (
    <section aria-label="Terrain stats" data-testid="terrain-stats" className="flex flex-col gap-2 border-t border-border pt-3">
      <h3 className="text-xs font-medium">Stats</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[11px]">
        {rows.map(([name, value]) => (
          <div key={name} className="contents">
            <dt className="text-muted-foreground">{name}</dt>
            <dd className="text-right tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {stats.warnings.length > 0 ? (
        <ul className="list-disc pl-4 text-[11px] text-amber-600 dark:text-amber-400">
          {stats.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
