import { MAP_MAX_SIDE, MAP_MIN_SIDE, spriteFolderLabel, TILESET_COLLISIONS, TILESET_SCHEMES, TILESET_TILE_SIZES, SPRITE_STYLES, TERRAIN_ISO_FLAT_NOTE, TERRAIN_TILES_MAX_SIDE, tilesetTileCount } from '@midnite/studio-shared';
import { LuFileInput, LuPlus, LuTrash2 } from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';
import { useMediaFiles, useMediaProjects } from '../use-media';
import { useMapEngine } from './map-engine';
import { ENV_KINDS, parsePropLines, TERRAIN_PRESETS, type EnvForm, type EnvKind, type EnvTerrainRow } from './sprite-form';

const FIELD = 'h-7 rounded-md border border-border bg-background px-1.5 text-xs text-foreground';
const LABEL = 'flex flex-col gap-1 text-[11px] font-medium text-muted-foreground';
const SECTION = 'flex flex-col gap-1.5 rounded-md border border-border/60 p-2';

const clampInt = (raw: string, min: number, max: number): number => Math.min(max, Math.max(min, Math.round(Number(raw)) || min));
/** A terrain folder holds `terrain.json`; each one is a choice. */
const terrainOfSpecPath = (path: string): string | null => /^([^/]+)\/terrain\.json$/.exec(path)?.[1] ?? null;
const SCHEME_LABEL = { blob47: '47-tile blob (Tiled mixed)', corner16: '16-tile corner (Tiled corner)' } as const;

/**
 * The Environment half of the create panel (Phase 106 Themes H and I): tilesets (terrains, transitions,
 * autotile scheme, or a Phase 105 terrain to render), isometric tiles, parallax backgrounds and prop
 * sheets, and maps (Theme J): a tileset, a size, optional decorations, and the layout engine.
 */
export function EnvironmentFields({
  repoId,
  form,
  onChange,
  onImportMap,
}: {
  repoId: string;
  form: EnvForm;
  onChange: (patch: Partial<EnvForm>) => void;
  /** Imports a Tiled `.tmj` as a new map asset instead. */
  onImportMap?: () => void;
}) {
  const tiles = form.kind === 'tileset' || form.kind === 'isometric';
  return (
    <>
      <label className={LABEL}>
        Kind
        <select aria-label="Kind" className={FIELD} value={form.kind} onChange={(e) => onChange({ kind: e.target.value as EnvKind })}>
          {ENV_KINDS.map((k) => (
            <option key={k.id} value={k.id}>{k.label}</option>
          ))}
        </select>
      </label>
      <label className={LABEL}>
        Name
        <input aria-label="Name" className={FIELD} value={form.name} placeholder="meadow" onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      <label className={LABEL}>
        Style
        <select aria-label="Style" className={FIELD} value={form.style} onChange={(e) => onChange({ style: e.target.value as EnvForm['style'] })}>
          {SPRITE_STYLES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
      {tiles ? <TilesetFields repoId={repoId} form={form} onChange={onChange} /> : null}
      {form.kind === 'background' ? <BackgroundFields form={form} onChange={onChange} /> : null}
      {form.kind === 'prop-sheet' ? <PropFields form={form} onChange={onChange} /> : null}
      {form.kind === 'map' ? <MapFields repoId={repoId} form={form} onChange={onChange} onImportMap={onImportMap} /> : null}
    </>
  );
}

function TilesetFields({ repoId, form, onChange }: { repoId: string; form: EnvForm; onChange: (patch: Partial<EnvForm>) => void }) {
  const ids = form.terrains.map((t) => t.id);
  const setTerrains = (terrains: EnvTerrainRow[]) => {
    const keep = new Set(terrains.map((t) => t.id));
    onChange({ terrains, transitions: form.transitions.filter((t) => keep.has(t.a) && keep.has(t.b)) });
  };
  const patchTerrain = (index: number, patch: Partial<EnvTerrainRow>) => setTerrains(form.terrains.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  const unused = TERRAIN_PRESETS.find((p) => !ids.includes(p.id));
  const count = tilesetTileCount({ terrains: form.terrains, transitions: form.transitions, scheme: form.scheme, projection: form.kind === 'isometric' ? 'isometric' : 'orthogonal' });
  return (
    <>
      <label className={LABEL}>
        Tile size
        <select aria-label="Tile size" className={FIELD} value={form.tileSize} onChange={(e) => onChange({ tileSize: Number(e.target.value) })}>
          {TILESET_TILE_SIZES.map((size) => (
            <option key={size} value={size}>{size} px</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-[11px] text-foreground">
        <input
          type="checkbox"
          aria-label="Render a terrain"
          className="accent-[hsl(var(--primary))]"
          checked={form.fromTerrain !== null}
          onChange={(e) => onChange({ fromTerrain: e.target.checked ? { project: '', terrain: '', metresPerTile: 4 } : null })}
        />
        Render a Terrain into tiles
      </label>
      {form.fromTerrain ? (
        <TerrainSource repoId={repoId} value={form.fromTerrain} isometric={form.kind === 'isometric'} onChange={(fromTerrain) => onChange({ fromTerrain })} />
      ) : (
        <>
          <label className={LABEL}>
            Autotiling
            <select aria-label="Autotiling" className={FIELD} value={form.scheme} onChange={(e) => onChange({ scheme: e.target.value as EnvForm['scheme'] })}>
              {TILESET_SCHEMES.map((scheme) => (
                <option key={scheme} value={scheme}>{SCHEME_LABEL[scheme]}</option>
              ))}
            </select>
          </label>
          <div className={SECTION} data-testid="tileset-terrains">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
              Terrains
              <IconButton icon={LuPlus} label="Add terrain" size="sm" disabled={form.terrains.length >= 8 || !unused} onClick={() => unused && setTerrains([...form.terrains, { ...unused }])} />
            </div>
            {form.terrains.map((t, index) => (
              <div key={`${t.id}-${index}`} className="flex items-center gap-1">
                <input aria-label={`Terrain ${index + 1} name`} className={`${FIELD} w-24`} value={t.label} onChange={(e) => patchTerrain(index, { label: e.target.value })} />
                <input aria-label={`Terrain ${index + 1} prompt`} className={`${FIELD} min-w-0 flex-1`} value={t.prompt} placeholder="what it looks like" onChange={(e) => patchTerrain(index, { prompt: e.target.value })} />
                <select aria-label={`Terrain ${index + 1} collision`} className={FIELD} value={t.collision} onChange={(e) => patchTerrain(index, { collision: e.target.value as EnvTerrainRow['collision'] })}>
                  {TILESET_COLLISIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <IconButton icon={LuTrash2} label={`Remove ${t.label}`} size="sm" disabled={form.terrains.length <= 2} onClick={() => setTerrains(form.terrains.filter((_, i) => i !== index))} />
              </div>
            ))}
          </div>
          <div className={SECTION} data-testid="tileset-transitions">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
              Transitions
              <IconButton
                icon={LuPlus}
                label="Add transition"
                size="sm"
                disabled={ids.length < 2}
                onClick={() => onChange({ transitions: [...form.transitions, { a: ids[0]!, b: ids.find((id) => id !== ids[0]) ?? ids[0]! }] })}
              />
            </div>
            {form.transitions.map((t, index) => (
              <div key={`${t.a}-${t.b}-${index}`} className="flex items-center gap-1 text-[11px]">
                <select aria-label={`Transition ${index + 1} under`} className={FIELD} value={t.a} onChange={(e) => onChange({ transitions: form.transitions.map((x, i) => (i === index ? { ...x, a: e.target.value } : x)) })}>
                  {ids.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
                <span className="text-muted-foreground">with</span>
                <select aria-label={`Transition ${index + 1} over`} className={FIELD} value={t.b} onChange={(e) => onChange({ transitions: form.transitions.map((x, i) => (i === index ? { ...x, b: e.target.value } : x)) })}>
                  {ids.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
                <IconButton icon={LuTrash2} label={`Remove transition ${index + 1}`} size="sm" onClick={() => onChange({ transitions: form.transitions.filter((_, i) => i !== index) })} />
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground">
              Each transition is composited from the two base tiles, so every edge matches. {count} tiles in all{form.kind === 'isometric' ? ', as diamond floors and a block per terrain' : ''}.
            </p>
          </div>
        </>
      )}
    </>
  );
}

/** Which Phase 105 terrain to render, and how many metres one tile covers. */
function TerrainSource({
  repoId,
  value,
  isometric,
  onChange,
}: {
  repoId: string;
  value: NonNullable<EnvForm['fromTerrain']>;
  isometric: boolean;
  onChange: (value: NonNullable<EnvForm['fromTerrain']>) => void;
}) {
  const projects = useMediaProjects(repoId, 'terrain');
  const files = useMediaFiles(repoId, 'terrain', value.project || null);
  const terrains = (files.data ?? []).map((f) => terrainOfSpecPath(f.path)).filter((t): t is string => t !== null);
  return (
    <div className={SECTION} data-testid="tileset-terrain-source">
      <label className={LABEL}>
        Terrain group
        <select aria-label="Terrain group" className={FIELD} value={value.project} onChange={(e) => onChange({ ...value, project: e.target.value, terrain: '' })}>
          <option value="">Choose…</option>
          {(projects.data ?? []).map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
      </label>
      <label className={LABEL}>
        Terrain
        <select aria-label="Terrain" className={FIELD} value={value.terrain} disabled={!value.project} onChange={(e) => onChange({ ...value, terrain: e.target.value })}>
          <option value="">Choose…</option>
          {terrains.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className={LABEL}>
        Metres per tile
        <input
          aria-label="Metres per tile"
          type="number"
          min={1}
          max={16}
          className={FIELD}
          value={value.metresPerTile}
          onChange={(e) => onChange({ ...value, metresPerTile: clampInt(e.target.value, 1, 16) })}
        />
      </label>
      <p className="text-[10px] text-muted-foreground">
        The terrain's drape is cut into one tile per {value.metresPerTile} m, and identical tiles are shared. A grid over {TERRAIN_TILES_MAX_SIDE} × {TERRAIN_TILES_MAX_SIDE} is refused.
        {isometric ? ` ${TERRAIN_ISO_FLAT_NOTE}` : ''}
      </p>
    </div>
  );
}

function BackgroundFields({ form, onChange }: { form: EnvForm; onChange: (patch: Partial<EnvForm>) => void }) {
  const patchLayer = (index: number, patch: Partial<EnvForm['layers'][number]>) => onChange({ layers: form.layers.map((l, i) => (i === index ? { ...l, ...patch } : l)) });
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <label className={LABEL}>
          Width
          <input aria-label="Width" type="number" min={64} max={4096} className={FIELD} value={form.bgSize[0]} onChange={(e) => onChange({ bgSize: [clampInt(e.target.value, 64, 4096), form.bgSize[1]] })} />
        </label>
        <label className={LABEL}>
          Height
          <input aria-label="Height" type="number" min={64} max={4096} className={FIELD} value={form.bgSize[1]} onChange={(e) => onChange({ bgSize: [form.bgSize[0], clampInt(e.target.value, 64, 4096)] })} />
        </label>
      </div>
      <div className={SECTION} data-testid="background-layers">
        <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
          Layers (back to front)
          <IconButton
            icon={LuPlus}
            label="Add layer"
            size="sm"
            disabled={form.layers.length >= 5}
            onClick={() => onChange({ layers: [...form.layers, { name: `layer-${form.layers.length + 1}`, prompt: '', scrollFactor: 0.9 }] })}
          />
        </div>
        {form.layers.map((layer, index) => (
          <div key={`${layer.name}-${index}`} className="flex items-center gap-1">
            <input aria-label={`Layer ${index + 1} name`} className={`${FIELD} w-16`} value={layer.name} onChange={(e) => patchLayer(index, { name: e.target.value })} />
            <input aria-label={`Layer ${index + 1} prompt`} className={`${FIELD} min-w-0 flex-1`} value={layer.prompt} placeholder="what it shows" onChange={(e) => patchLayer(index, { prompt: e.target.value })} />
            <input
              aria-label={`Layer ${index + 1} scroll factor`}
              type="number"
              min={0}
              max={1}
              step={0.05}
              className={`${FIELD} w-14`}
              value={layer.scrollFactor}
              onChange={(e) => patchLayer(index, { scrollFactor: Math.min(1, Math.max(0, Number(e.target.value) || 0)) })}
            />
            <IconButton icon={LuTrash2} label={`Remove ${layer.name}`} size="sm" disabled={form.layers.length <= 3} onClick={() => onChange({ layers: form.layers.filter((_, i) => i !== index) })} />
          </div>
        ))}
        <p className="text-[10px] text-muted-foreground">Scroll factor: 0 holds still, 1 moves with the world. Every layer wraps sideways; all but the sky are cut out to transparent.</p>
      </div>
    </>
  );
}

function PropFields({ form, onChange }: { form: EnvForm; onChange: (patch: Partial<EnvForm>) => void }) {
  const props = parsePropLines(form.propsText);
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <label className={LABEL}>
          Cell width
          <input aria-label="Cell width" type="number" min={8} max={512} className={FIELD} value={form.cell[0]} onChange={(e) => onChange({ cell: [clampInt(e.target.value, 8, 512), form.cell[1]] })} />
        </label>
        <label className={LABEL}>
          Cell height
          <input aria-label="Cell height" type="number" min={8} max={512} className={FIELD} value={form.cell[1]} onChange={(e) => onChange({ cell: [form.cell[0], clampInt(e.target.value, 8, 512)] })} />
        </label>
      </div>
      <label className={LABEL}>
        Props, one per line
        <textarea
          aria-label="Props"
          rows={6}
          className="rounded-md border border-border bg-background px-1.5 py-1 text-xs text-foreground"
          value={form.propsText}
          placeholder="crate: a wooden crate"
          onChange={(e) => onChange({ propsText: e.target.value })}
        />
      </label>
      <p className="text-[10px] text-muted-foreground">{props.length} {props.length === 1 ? 'prop' : 'props'}, each drawn on its own, cut out and fitted to the cell, then packed into one atlas on export.</p>
    </>
  );
}

/** An asset folder per `<asset>/sprite.json` in a group. */
const assetsOf = (paths: ReadonlyArray<{ path: string }> | undefined): string[] =>
  (paths ?? []).map((f) => /^([^/]+)\/sprite\.json$/.exec(f.path)?.[1]).filter((a): a is string => a !== undefined);

/** Map (Theme J): the tileset, the size the engine is asked for, decorations, and the engine itself. */
function MapFields({ repoId, form, onChange, onImportMap }: { repoId: string; form: EnvForm; onChange: (patch: Partial<EnvForm>) => void; onImportMap?: () => void }) {
  const tilesets = assetsOf(useMediaFiles(repoId, 'sprite', 'tilesets').data);
  const objects = assetsOf(useMediaFiles(repoId, 'sprite', 'objects').data);
  const { label } = useMapEngine();
  return (
    <div className={SECTION} data-testid="map-fields">
      <label className={LABEL}>
        Tileset
        <select aria-label="Tileset" className={FIELD} value={form.mapTileset} onChange={(e) => onChange({ mapTileset: e.target.value })}>
          <option value="">{tilesets.length === 0 ? 'Make a tileset first…' : 'Choose…'}</option>
          {tilesets.map((t) => (
            <option key={t} value={t}>{spriteFolderLabel(t)}</option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={LABEL}>
          Width (tiles)
          <input aria-label="Map width" type="number" min={MAP_MIN_SIDE} max={MAP_MAX_SIDE} className={FIELD} value={form.mapSize[0]} onChange={(e) => onChange({ mapSize: [clampInt(e.target.value, MAP_MIN_SIDE, MAP_MAX_SIDE), form.mapSize[1]] })} />
        </label>
        <label className={LABEL}>
          Height (tiles)
          <input aria-label="Map height" type="number" min={MAP_MIN_SIDE} max={MAP_MAX_SIDE} className={FIELD} value={form.mapSize[1]} onChange={(e) => onChange({ mapSize: [form.mapSize[0], clampInt(e.target.value, MAP_MIN_SIDE, MAP_MAX_SIDE)] })} />
        </label>
      </div>
      <label className={LABEL}>
        Decorations
        <select aria-label="Decorations" className={FIELD} value={form.mapProps} onChange={(e) => onChange({ mapProps: e.target.value })}>
          <option value="">None</option>
          {objects.map((o) => (
            <option key={o} value={o}>{spriteFolderLabel(o)}</option>
          ))}
        </select>
      </label>
      {form.mapProps ? (
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          Density
          <input aria-label="Decoration density" type="range" min={0.05} max={1} step={0.05} value={form.mapDensity} onChange={(e) => onChange({ mapDensity: Number(e.target.value) })} className="flex-1" />
          <span className="w-8 tabular-nums">{Math.round(form.mapDensity * 100)}%</span>
        </label>
      ) : null}
      <p className="text-[10px] text-muted-foreground" data-testid="map-engine">
        Layout by {label} (set in Media ▸ Models). It writes regions, rooms, paths, a spawn and exits from the prompt; the map is autotiled with the tileset’s own transitions and saved as Tiled .tmj.
      </p>
      {onImportMap ? (
        <button type="button" onClick={onImportMap} className="flex h-7 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-xs font-medium">
          <LuFileInput aria-hidden className="size-3.5" />
          Import .tmj…
        </button>
      ) : null}
    </div>
  );
}
