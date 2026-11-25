import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ObjectRef } from './level-edit-model';
import { refKey } from './level-selection';

export const OUTLINER_WIDTH = { initial: 224, min: 160, max: 420 } as const;

type State = {
  /** `${gameId}/${scene}` → the refKeys hidden in the editor. Never written to the `.tmj` (Phase 137 Theme H). */
  hiddenByScene: Record<string, string[]>;
  lockedByScene: Record<string, string[]>;
  /** The aside's width in px, clamped to {@link OUTLINER_WIDTH}. */
  width: number;
  /** Snap-collapsed to the 32 px strip. */
  collapsed: boolean;
  toggleHidden: (scene: string, keys: readonly string[]) => void;
  toggleLocked: (scene: string, keys: readonly string[]) => void;
  setWidth: (width: number) => void;
  setCollapsed: (collapsed: boolean) => void;
};

export const sceneKey = (gameId: string, scene: string): string => `${gameId}/${scene}`;

/** Flip `keys`: all become set unless every one already is, in which case all clear (one eye click on a multi-selection). */
function flip(map: Record<string, string[]>, scene: string, keys: readonly string[]): Record<string, string[]> {
  if (keys.length === 0) return map;
  const now = new Set(map[scene] ?? []);
  const allSet = keys.every((k) => now.has(k));
  for (const k of keys) {
    if (allSet) now.delete(k);
    else now.add(k);
  }
  const next = { ...map };
  if (now.size === 0) delete next[scene];
  else next[scene] = [...now];
  return next;
}

export const clampWidth = (w: number): number => Math.min(OUTLINER_WIDTH.max, Math.max(OUTLINER_WIDTH.min, Math.round(w)));

/** Persisted in the renderer (`midnite-studio.level-outliner`). Editor-only: the level file and the game never see it. */
export const useLevelOutlinerStore = create<State>()(
  persist(
    (set) => ({
      hiddenByScene: {},
      lockedByScene: {},
      width: OUTLINER_WIDTH.initial,
      collapsed: false,
      toggleHidden: (scene, keys) => set((s) => ({ hiddenByScene: flip(s.hiddenByScene, scene, keys) })),
      toggleLocked: (scene, keys) => set((s) => ({ lockedByScene: flip(s.lockedByScene, scene, keys) })),
      setWidth: (width) => set({ width: clampWidth(width) }),
      setCollapsed: (collapsed) => set({ collapsed }),
    }),
    {
      name: 'midnite-studio.level-outliner',
      version: 1,
      partialize: (s) => ({ hiddenByScene: s.hiddenByScene, lockedByScene: s.lockedByScene, width: s.width, collapsed: s.collapsed }),
      // A hand-edited or older payload never breaks the editor: anything unexpected falls back to the default.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        const clean = (m: unknown): Record<string, string[]> => {
          const out: Record<string, string[]> = {};
          if (m && typeof m === 'object') for (const [k, v] of Object.entries(m)) if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === 'string');
          return out;
        };
        return {
          ...current,
          hiddenByScene: clean(p.hiddenByScene),
          lockedByScene: clean(p.lockedByScene),
          width: typeof p.width === 'number' && Number.isFinite(p.width) ? clampWidth(p.width) : OUTLINER_WIDTH.initial,
          collapsed: p.collapsed === true,
        };
      },
    },
  ),
);

const NONE: readonly string[] = [];
export const hiddenKeys = (s: Pick<State, 'hiddenByScene'>, gameId: string, scene: string): readonly string[] => s.hiddenByScene[sceneKey(gameId, scene)] ?? NONE;
export const lockedKeys = (s: Pick<State, 'lockedByScene'>, gameId: string, scene: string): readonly string[] => s.lockedByScene[sceneKey(gameId, scene)] ?? NONE;

/** Whether the pointer may hit or marquee `ref`: neither hidden nor locked. */
export function isSelectable(gameId: string, scene: string, ref: ObjectRef): boolean {
  const s = useLevelOutlinerStore.getState();
  const key = refKey(ref);
  return !hiddenKeys(s, gameId, scene).includes(key) && !lockedKeys(s, gameId, scene).includes(key);
}
