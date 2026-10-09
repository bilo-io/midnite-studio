import { MAP_LAYER_MAX_BYTES, MapLayerNameSchema, type MapLayerFile } from '@midnite/studio-shared';
import { useRef, useState, type KeyboardEvent } from 'react';
import { LuEye, LuEyeOff, LuGripVertical, LuPencil, LuPlus, LuTrash2, LuUpload } from 'react-icons/lu';

import { useDialogs } from '../../../components/dialog-host';
import { IconButton } from '../../../components/icon-button';
import { SortableList, useSortableRow } from '../../../components/sortable-list';
import { useToastStore } from '../../../store/toast-store';
import { importGeoJson, kmlToGeoJson } from './kml';
import type { LayerView } from './map-layers';
import type { MapLayers } from './use-map-layers';

const toast = (message: string, status: 'success' | 'error' | 'info' = 'info') => useToastStore.getState().addToast({ message, status });

export const BAD_LAYER_TEXT = 'Not valid GeoJSON — fix the file or delete the layer.';

/** Reads a dropped/picked `.geojson` or `.kml` into a layer; reports why on refusal. */
export async function readLayerFile(file: File): Promise<{ name: string; layer: MapLayerFile; skipped: number } | null> {
  if (file.size > MAP_LAYER_MAX_BYTES) {
    toast('Layers up to 10 MB.', 'error');
    return null;
  }
  const text = await file.text();
  const isKml = /\.kml$/i.test(file.name);
  const result = isKml ? kmlToGeoJson(text) : importGeoJson(text);
  if (!result) {
    toast(`${file.name} is not valid ${isKml ? 'KML' : 'GeoJSON'}.`, 'error');
    return null;
  }
  const name = file.name.replace(/\.(geojson|json|kml)$/i, '').replace(/[/\\]/g, '-').trim() || 'imported';
  return { name, layer: result.layer, skipped: result.skipped };
}

function LayerRow({ layer, layers, active, count }: { layer: LayerView; layers: MapLayers; active: boolean; count: number }) {
  const dialogs = useDialogs();
  const sort = useSortableRow(layer.name);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(layer.name);
  const broken = layer.fc === null;

  const commitRename = async () => {
    setRenaming(false);
    const parsed = MapLayerNameSchema.safeParse(draft.trim());
    if (!parsed.success) return toast(parsed.error.issues[0]?.message ?? 'Not a valid layer name.', 'error');
    if (!(await layers.rename(layer.name, parsed.data))) toast(`A layer named "${parsed.data}" already exists.`, 'error');
  };
  const remove = () =>
    dialogs.confirm({
      title: 'Move layer to the Trash',
      body: `Move layer '${layer.name}' (${count} features) to the Trash?`,
      confirmLabel: 'Move to Trash',
      danger: true,
      onConfirm: () => void layers.remove(layer.name),
    });
  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.target !== e.currentTarget || !e.altKey) return;
    if (e.key === 'ArrowUp') layers.move(layer.name, -1);
    else if (e.key === 'ArrowDown') layers.move(layer.name, 1);
    else return;
    e.preventDefault();
  };

  return (
    <li
      ref={sort.setNodeRef}
      style={sort.style}
      tabIndex={0}
      aria-label={`Layer ${layer.name}`}
      aria-current={active}
      onKeyDown={onKeyDown}
      className={`rounded-md px-1 py-0.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-primary/50 ${active ? 'bg-primary/10' : 'hover:bg-accent/60'}`}
    >
      <div className="flex items-center gap-1">
        <span ref={sort.setActivatorNodeRef} {...sort.attributes} {...sort.listeners} aria-label={`Reorder ${layer.name} (Alt+Up or Down)`} className="cursor-grab text-muted-foreground">
          <LuGripVertical aria-hidden className="h-3.5 w-3.5" />
        </span>
        <IconButton icon={layer.visible ? LuEye : LuEyeOff} size="sm" label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`} aria-pressed={layer.visible} onClick={() => layers.setStyle(layer.name, { visible: !layer.visible })} />
        <input type="color" aria-label={`Colour of ${layer.name}`} value={layer.color} onChange={(e) => layers.setStyle(layer.name, { color: e.target.value })} className="h-4 w-4 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" />
        {renaming ? (
          <input
            autoFocus
            aria-label="Layer name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitRename();
              else if (e.key === 'Escape') setRenaming(false);
              e.stopPropagation();
            }}
            className="min-w-0 flex-1 rounded border border-border bg-background px-1"
          />
        ) : (
          <button type="button" onClick={() => layers.setActive(layer.name)} className="min-w-0 flex-1 truncate text-left" title={layer.name}>
            {layer.name}
          </button>
        )}
        <span className="shrink-0 tabular-nums text-muted-foreground">{broken ? '!' : count}</span>
        <IconButton icon={LuPencil} size="sm" label={`Rename ${layer.name}`} onClick={() => { setDraft(layer.name); setRenaming(true); }} />
        <IconButton icon={LuTrash2} size="sm" label={`Delete ${layer.name}`} onClick={remove} />
      </div>
      {broken ? <p className="pl-5 text-[11px] text-destructive">{BAD_LAYER_TEXT}</p> : null}
    </li>
  );
}

/** The layer list (Phase 108 Theme H): visibility, colour, rename, Trash, reorder, New and Import. */
export function MapLayerList({ layers }: { layers: MapLayers }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const names = layers.layers.map((l) => l.name);

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const read = await readLayerFile(file);
    if (!read) return;
    const made = await layers.create(read.name, read.layer);
    if (made) toast(`Imported ${read.layer.features.length} features into "${made}"${read.skipped ? ` (${read.skipped} skipped)` : ''}.`, read.skipped ? 'info' : 'success');
  };

  return (
    <section aria-label="Layers" className="flex max-h-[45%] min-h-0 shrink-0 flex-col border-t border-border" data-testid="map-layers">
      <div className="flex h-8 shrink-0 items-center justify-between px-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Layers</h2>
        <div className="flex items-center">
          <IconButton icon={LuPlus} size="sm" label="New layer" onClick={() => void layers.create('Layer')} />
          <IconButton icon={LuUpload} size="sm" label="Import layer (.geojson, .kml)" onClick={() => fileInput.current?.click()} />
          <input ref={fileInput} type="file" accept=".geojson,.json,.kml" hidden aria-label="Import layer file" onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>
      {layers.layers.length === 0 ? (
        <p className="px-3 pb-3 text-xs text-muted-foreground">No layers yet. Draw something, or import a .geojson or .kml.</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1 pb-2">
          <SortableList ids={names} onReorder={layers.reorder}>
            {layers.layers.map((l) => (
              <LayerRow key={l.name} layer={l} layers={layers} active={layers.active === l.name} count={l.fc?.features.length ?? 0} />
            ))}
          </SortableList>
        </ul>
      )}
    </section>
  );
}
