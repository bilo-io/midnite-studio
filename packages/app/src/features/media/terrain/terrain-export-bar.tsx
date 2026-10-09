import { MEDIA_TAB_EXPORT_FORMATS, TERRAIN_EXPORT_TEXTURES, type MediaExportFormat, type TerrainExportTexture } from '@midnite/studio-shared';
import { useState } from 'react';

import { bridge } from '../../../services/bridge';
import { noBridge, reportFailure } from '../../../services/bridge-result';
import { useToastStore } from '../../../store/toast-store';
import { useUiStore } from '../../../store/ui-store';
import { ExportToolbar } from '../export-toolbar';
import type { TerrainRef } from './use-terrain';

const TEXTURE_LABEL: Record<TerrainExportTexture, string> = { drape: 'Drape', 'splat-bake': 'Baked splat', none: 'None' };

/**
 * The Terrain tab's export controls (Phase 105 Theme I): the shared split button with the pack
 * first, plus the glb's options (LOD, texture, what to include). The destination is the Media
 * export folder, else a directory prompt; main refuses to overwrite and answers with the path.
 */
export function TerrainExportBar({ repoId, terrainRef, built }: { repoId: string; terrainRef: TerrainRef | null; built: boolean }) {
  const exportDir = useUiStore((s) => s.mediaExportDir);
  const [busy, setBusy] = useState(false);
  const [lod, setLod] = useState(1);
  const [texture, setTexture] = useState<TerrainExportTexture>('drape');
  const [include, setInclude] = useState({ foliage: true, roads: true, buildings: true });

  const onExport = async (format: MediaExportFormat) => {
    if (!terrainRef || (format !== 'glb' && format !== 'terrain-pack')) return;
    const dest = exportDir ?? (await bridge()?.repos.pickDirectory());
    if (!dest) return;
    setBusy(true);
    try {
      const api = bridge()?.media.terrain;
      const result = api ? await api.export({ repoId, ...terrainRef, format, dest, lod, texture, ...include }) : noBridge<never>();
      if (!result.ok) {
        reportFailure(result);
        return;
      }
      useToastStore.getState().addToast({
        message: `Exported to ${result.value.path}`,
        status: 'success',
        action: {
          label: 'Reveal',
          onAction: () => void bridge()?.media.reveal({ repoId, tab: 'terrain', project: terrainRef.project, path: terrainRef.terrain }),
        },
      });
    } finally {
      setBusy(false);
    }
  };

  const select = 'h-6 rounded border border-border bg-card px-1 text-[11px] text-foreground';
  return (
    <div className="ml-auto flex items-center gap-3">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground" role="group" aria-label="GLB export options">
        <span>GLB</span>
        <label className="flex items-center gap-1">
          LOD
          <select aria-label="LOD" className={select} value={lod} onChange={(e) => setLod(Number(e.target.value))}>
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          Texture
          <select aria-label="Texture" className={select} value={texture} onChange={(e) => setTexture(e.target.value as TerrainExportTexture)}>
            {TERRAIN_EXPORT_TEXTURES.map((t) => (
              <option key={t} value={t}>
                {TEXTURE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        {(['foliage', 'roads', 'buildings'] as const).map((key) => (
          <label key={key} className="flex items-center gap-1 capitalize">
            <input type="checkbox" checked={include[key]} onChange={(e) => setInclude((cur) => ({ ...cur, [key]: e.target.checked }))} />
            {key}
          </label>
        ))}
      </div>
      <ExportToolbar formats={MEDIA_TAB_EXPORT_FORMATS.terrain} hasSelection={built && terrainRef !== null} onExport={(f) => void onExport(f)} busy={busy} />
    </div>
  );
}
