/**
 * Dragging an asset into the level (Phase 139 Theme D). HTML5 DnD with a custom MIME; because a browser hides the
 * payload from `dragover` (only the types are readable), the payload being dragged also lives in a tiny module store
 * so the canvases can draw a ghost before the drop. The same store holds the *armed* asset for click-to-place.
 */
import { useSyncExternalStore } from 'react';
import type { GameAssetProvenance } from '@midnite/studio-shared';

type GameAssetKind = GameAssetProvenance['kind'];

import type { EditLevel, LevelObject } from '../level-edit-model';

export const ASSET_DRAG_MIME = 'application/x-midnite-level-asset';

export type AssetDragPayload = { kind: 'asset'; name: string; assetKind: GameAssetKind } | { kind: 'prefab'; name: string };
export type AssetPayload = Extract<AssetDragPayload, { kind: 'asset' }>;

export function parseAssetDrag(raw: string | undefined | null): AssetDragPayload | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<AssetDragPayload> | null;
    if (v && v.kind === 'asset' && typeof v.name === 'string' && typeof (v as AssetPayload).assetKind === 'string') return v as AssetPayload;
    if (v && v.kind === 'prefab' && typeof v.name === 'string') return { kind: 'prefab', name: v.name };
  } catch {
    // not ours
  }
  return null;
}

/** A tile's `dragstart`: write the payload and record it for the ghost. */
export function startAssetDrag(dt: DataTransfer | null, payload: AssetDragPayload): void {
  if (dt) {
    dt.setData(ASSET_DRAG_MIME, JSON.stringify(payload));
    dt.effectAllowed = 'copy';
  }
  store.set({ dragging: payload });
}
export const endAssetDrag = (): void => store.set({ dragging: null });

/** Whether a drag event carries one of ours (readable during `dragover`, unlike the data). */
export const isAssetDrag = (dt: DataTransfer | null | undefined): boolean => !!dt && Array.from(dt.types ?? []).includes(ASSET_DRAG_MIME);

type DragState = { dragging: AssetDragPayload | null; armed: AssetDragPayload | null };
function createStore() {
  let state: DragState = { dragging: null, armed: null };
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<DragState>) {
      state = { ...state, ...patch };
      subs.forEach((f) => f());
    },
    subscribe(f: () => void) {
      subs.add(f);
      return () => void subs.delete(f);
    },
  };
}
const store = createStore();

export const assetDragStore = store;
export const arm = (payload: AssetDragPayload | null): void => store.set({ armed: payload });
export const useDraggedAsset = (): AssetDragPayload | null => useSyncExternalStore(store.subscribe, () => store.get().dragging);
export const useArmedAsset = (): AssetDragPayload | null => useSyncExternalStore(store.subscribe, () => store.get().armed);

/** Models place in 3D levels only; the 2D kit has no generic sprite object (Phase 139 "Not in this phase"). */
export function placementRefusal(payload: AssetDragPayload, is3d: boolean): string | null {
  if (payload.kind !== 'asset') return null;
  if (payload.assetKind !== 'model') return 'Only models place in a level.';
  return is3d ? null : 'Models place in 3D levels.';
}

/** A `prop` object with `model` set, at `at` (plan pixels, already snapped by the caller). */
export function dropToObject(payload: AssetPayload, at: { x: number; y: number }, level?: EditLevel): Omit<LevelObject, 'id'> {
  void level;
  return {
    name: payload.name.replace(/\.[^.]+$/, '') || payload.name,
    type: 'prop',
    x: at.x,
    y: at.y,
    width: 0,
    height: 0,
    rotation: 0,
    visible: true,
    point: true,
    properties: [{ name: 'model', type: 'string', value: payload.name }],
  };
}
