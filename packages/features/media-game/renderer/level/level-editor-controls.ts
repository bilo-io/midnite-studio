/**
 * What the one open Level editor lets the agent bridge do to its screen (Phase 138 Themes G, H): move the camera,
 * switch to 3D, take a picture. The editor registers an implementation per game while it is mounted; the bridge's
 * `select`, `frame` and `view` answers call it. A module-level map, not React context, because the bridge answers
 * from outside the tree.
 */
import type { GameLevelTerrain, LevelViewCamera } from '@midnite/studio-shared';

import type { ObjectRef, PlanRect } from './level-edit-model';

export type LevelCaptureRequest = { preset: 'top' | 'iso' | 'selection' | 'current'; camera?: LevelViewCamera | undefined; width: number; height: number };
export type LevelCaptured = { png: string; camera: LevelViewCamera | null; objects: number; width: number; height: number };

export type LevelEditorControls = {
  /** Which view the editor shows now. */
  mode: () => 'plan' | '3d';
  terrain: () => Pick<GameLevelTerrain, 'minX' | 'minZ' | 'maxX' | 'maxZ'> | null;
  /** Fit `rect` (map pixels) in the plan view; in 3D move the camera over `refs` (else over `rect`'s ground). */
  frame: (rect: PlanRect, refs: readonly ObjectRef[]) => void;
  /** Show the 3D view and wait (at most `timeoutMs`) for it; `false` when the level has no 3D view or it never came. */
  show3d: (timeoutMs: number) => Promise<boolean>;
  capture3d: (req: LevelCaptureRequest) => Promise<LevelCaptured | null>;
  /** The plan, drawn off-screen (3D level) or the canvas as it is (tile level). */
  capturePlan: (req: LevelCaptureRequest & { rect: PlanRect | null }) => Promise<LevelCaptured | null>;
  can3d: () => boolean;
};

const registry = new Map<string, LevelEditorControls>();

/** Register `controls` for a game; the returned function removes them (only if they are still the registered ones). */
export function registerEditorControls(gameId: string, controls: LevelEditorControls): () => void {
  registry.set(gameId, controls);
  return () => {
    if (registry.get(gameId) === controls) registry.delete(gameId);
  };
}

export const editorControls = (gameId: string): LevelEditorControls | undefined => registry.get(gameId);
