/**
 * Clipboard and duplicate for the level editor (Phase 137 Theme B): pure ops on {@link EditState} plus a thin
 * system-clipboard adapter with an in-memory fallback. A clipboard is versioned JSON, so it round-trips through the
 * system clipboard (copy between two games) and a stale or foreign string parses to `null`, never throws. Tiles are
 * not copied here: Phase 143's stamp brush owns tile copy. Positions are plan units, the same as `selectionBounds`.
 */
import { insertObjects, isLevel3d, type EditState, type LevelObject, type ObjectRef, type PlanPoint } from './level-edit-model';
import { selectionBounds } from './level-selection';

export const LEVEL_CLIPBOARD_KIND = 'midnite-level-clipboard';

export type LevelClipboard = {
  kind: typeof LEVEL_CLIPBOARD_KIND;
  version: 1;
  dimension: '2d' | '3d';
  /** The selection bounds' top-left at copy time, in plan units. */
  origin: PlanPoint;
  /** Deep copies with `id: 0`, positions relative to `origin`. */
  objects: LevelObject[];
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const dimensionOf = (state: EditState): '2d' | '3d' => (isLevel3d(state.level) ? '3d' : '2d');

/** The selected objects as a clipboard, or `null` when nothing (that still exists) is selected. */
export function copySelection(state: EditState): LevelClipboard | null {
  const refs: ObjectRef[] = [];
  const objects: LevelObject[] = [];
  for (const ref of state.selected) {
    const layer = state.level.layers.find((l) => l.id === ref.layerId);
    const object = layer?.objects?.find((o) => o.id === ref.objectId);
    if (!object) continue;
    refs.push(ref);
    objects.push(object);
  }
  const bounds = selectionBounds(state.level, refs);
  if (!bounds) return null;
  const origin = { x: bounds.x, y: bounds.y };
  return {
    kind: LEVEL_CLIPBOARD_KIND,
    version: 1,
    dimension: dimensionOf(state),
    origin,
    objects: objects.map((o) => ({ ...clone(o), id: 0, x: o.x - origin.x, y: o.y - origin.y })),
  };
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A clipboard from `text`, or `null` for anything that is not one (not JSON, another kind, a newer version, a bad shape). */
export function parseClipboard(text: string): LevelClipboard | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const c = raw as Record<string, unknown>;
  if (c.kind !== LEVEL_CLIPBOARD_KIND || c.version !== 1) return null;
  if (c.dimension !== '2d' && c.dimension !== '3d') return null;
  const origin = c.origin as Record<string, unknown> | null;
  if (typeof origin !== 'object' || origin === null || !isNumber(origin.x) || !isNumber(origin.y)) return null;
  if (!Array.isArray(c.objects) || c.objects.length === 0) return null;
  for (const o of c.objects) {
    if (typeof o !== 'object' || o === null) return null;
    const obj = o as Record<string, unknown>;
    if (!isNumber(obj.x) || !isNumber(obj.y) || typeof obj.name !== 'string') return null;
  }
  return { kind: LEVEL_CLIPBOARD_KIND, version: 1, dimension: c.dimension, origin: { x: origin.x, y: origin.y }, objects: clone(c.objects as LevelObject[]) };
}

/**
 * Paste `clip` into object layer `layerId` with its origin at `at`, as one undo step. The pasted objects become the
 * selection. Pastes nothing into a layer that is not an object layer, or a clipboard from the other dimension.
 */
export function pasteClipboard(state: EditState, clip: LevelClipboard, layerId: number, at: PlanPoint): EditState {
  if (clip.dimension !== dimensionOf(state)) return state;
  return insertObjects(
    state,
    clip.objects.map((o) => {
      const { id: _id, ...rest } = clone(o);
      return { layerId, object: { ...rest, x: at.x + o.x, y: at.y + o.y } };
    }),
  );
}

/** Mod+D: copies of the selection at the same positions, each in its own layer, selected so the next drag moves them off the originals. */
export function duplicateSelection(state: EditState): EditState {
  const items: Array<{ layerId: number; object: Omit<LevelObject, 'id'> }> = [];
  for (const ref of state.selected) {
    const object = state.level.layers.find((l) => l.id === ref.layerId)?.objects?.find((o) => o.id === ref.objectId);
    if (!object) continue;
    const { id: _id, ...rest } = clone(object);
    items.push({ layerId: ref.layerId, object: rest });
  }
  return insertObjects(state, items);
}

let memory: LevelClipboard | null = null;

/** Put `clip` on the system clipboard (when there is one and it lets us) and always in memory. Never rejects. */
export async function writeClipboard(clip: LevelClipboard): Promise<void> {
  memory = clip;
  try {
    await navigator.clipboard?.writeText(JSON.stringify(clip));
  } catch {
    // Denied or unavailable: the in-memory copy still serves this window.
  }
}

/** The clipboard: the system's when it holds one of ours, else the last one written in this window. Never rejects. */
export async function readClipboard(): Promise<LevelClipboard | null> {
  try {
    const text = await navigator.clipboard?.readText();
    const parsed = text ? parseClipboard(text) : null;
    if (parsed) return parsed;
  } catch {
    // Denied or unavailable.
  }
  return memory;
}

/** Test seam: forget the in-memory copy. */
export function resetClipboardMemory(): void {
  memory = null;
}
