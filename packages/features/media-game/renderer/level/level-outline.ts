/**
 * The outliner's tree (Phase 137 Theme H): pure, no React. A flat row list, layers first (top layer first, as Tiled
 * lists them) with their objects under them, filtered by a search query and the collapsed set.
 */
import type { EditLevel, LevelObject, ObjectRef } from './level-edit-model';
import { refKey } from './level-selection';

export type OutlineRow =
  | { kind: 'layer'; layerId: number; name: string; layerKind: 'tile' | 'object'; depth: 0; count: number; visible: boolean }
  | { kind: 'object'; ref: ObjectRef; name: string; type: string; depth: 1; hidden: boolean; locked: boolean };

export type OutlineOptions = {
  query: string;
  collapsed: ReadonlySet<number>;
  hidden: ReadonlySet<string>;
  locked: ReadonlySet<string>;
};

/** An object's entity type (`type`, else Tiled's newer `class`). */
export const objectType = (o: Pick<LevelObject, 'type' | 'class'>): string => (o.type && o.type !== '' ? o.type : o.class ?? '');

/** The row label: the object's name, else `type #id`. */
export const objectLabel = (o: Pick<LevelObject, 'id' | 'name' | 'type' | 'class'>): string => (o.name && o.name.trim() !== '' ? o.name : `${objectType(o) || 'object'} #${o.id}`);

/**
 * Build the rows. A search matches an object's label or type, case-insensitively; a layer row stays when any child
 * matches (and is shown expanded while searching, so a match is never hidden under a collapsed layer). Tile layers
 * have no children and drop out while a query is set.
 */
export function buildLevelOutline(level: EditLevel, opts: OutlineOptions): OutlineRow[] {
  const q = opts.query.trim().toLowerCase();
  const rows: OutlineRow[] = [];
  for (let i = level.layers.length - 1; i >= 0; i -= 1) {
    const layer = level.layers[i]!;
    if (typeof layer.id !== 'number') continue;
    const layerId = layer.id;
    if (layer.type !== 'objectgroup') {
      if (q === '') rows.push({ kind: 'layer', layerId, name: layer.name, layerKind: 'tile', depth: 0, count: 0, visible: layer.visible !== false });
      continue;
    }
    const objects = layer.objects ?? [];
    const kept = q === '' ? objects : objects.filter((o) => objectLabel(o).toLowerCase().includes(q) || objectType(o).toLowerCase().includes(q));
    if (q !== '' && kept.length === 0) continue;
    rows.push({ kind: 'layer', layerId, name: layer.name, layerKind: 'object', depth: 0, count: objects.length, visible: layer.visible !== false });
    if (q === '' && opts.collapsed.has(layerId)) continue;
    // The newest object first, as the layer's top is its last.
    for (let j = kept.length - 1; j >= 0; j -= 1) {
      const o = kept[j]!;
      const ref = { layerId, objectId: o.id };
      const key = refKey(ref);
      rows.push({ kind: 'object', ref, name: objectLabel(o), type: objectType(o), depth: 1, hidden: opts.hidden.has(key), locked: opts.locked.has(key) });
    }
  }
  return rows;
}

/**
 * Shift-click: the object rows from `from` to `to` inclusive, in row order. Either end missing from `rows` (filtered
 * out, or in a collapsed layer) gives just `to`, which is what a plain click would select.
 */
export function rangeRefs(rows: readonly OutlineRow[], from: ObjectRef, to: ObjectRef): ObjectRef[] {
  const objects = rows.filter((r): r is Extract<OutlineRow, { kind: 'object' }> => r.kind === 'object');
  const a = objects.findIndex((r) => refKey(r.ref) === refKey(from));
  const b = objects.findIndex((r) => refKey(r.ref) === refKey(to));
  if (a < 0 || b < 0) return [to];
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const slice = objects.slice(lo, hi + 1).map((r) => r.ref);
  return a < b ? slice : slice.reverse();
}
