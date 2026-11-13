import type { GameLevelGetResult, GameLevelTerrain } from '@midnite/studio-shared';
import { create } from 'zustand';

import { createEditState, toEditLevel, type EditState } from './level-edit-model';

/** What the editor has open for one game: the scene, its edit state (with the undo stack), issues and images. */
export type OpenLevel = {
  scene: string;
  edit: EditState;
  /** `parseGameLevel`'s issues; any means the level opens read-only. */
  issues: string[];
  images: GameLevelGetResult['images'];
  /** A 3D level's terrain extent, drawn under the plan (Phase 132 Theme E). */
  terrain: GameLevelTerrain | null;
  /** The level is not a map the 2D editor can hold (not JSON, a 3D one, or unreadable). */
  unreadable: boolean;
};

/** A tileset image that is missing or oversized does not stop an edit; any other issue does (the level is not valid). */
export const isImageIssue = (issue: string): boolean => /^tilesets\.[^:]*\.image:/.test(issue);
export const blockingIssues = (entry: OpenLevel): string[] => entry.issues.filter((i) => !isImageIssue(i));

type LevelStore = {
  byGame: Record<string, OpenLevel | undefined>;
  /** Open `scene` from a fetched level, replacing whatever the game had open. */
  open: (gameId: string, scene: string, data: GameLevelGetResult) => void;
  /** Change the open level's edit state. A no-op when nothing is open for the game. */
  update: (gameId: string, fn: (edit: EditState) => EditState) => void;
  close: (gameId: string) => void;
  /** The New scene dialog (rendered by the scene picker, which is on screen on both tabs): the game it is open for. */
  newSceneFor: string | null;
  openNewScene: (gameId: string) => void;
  closeNewScene: () => void;
};

export function openLevelFrom(scene: string, data: GameLevelGetResult): OpenLevel {
  const level = toEditLevel(data.level);
  const issues = data.issues.map((i) => (i.path === '(root)' ? i.message : `${i.path}: ${i.message}`));
  if (!level) {
    return { scene, edit: createEditState({ orientation: 'orthogonal', width: 1, height: 1, tilewidth: 1, tileheight: 1, layers: [], tilesets: [] }), issues: issues.length ? issues : ['This is not a Tiled map.'], images: data.images, terrain: null, unreadable: true };
  }
  return { scene, edit: createEditState(level), issues, images: data.images, terrain: data.terrain ?? null, unreadable: false };
}

/**
 * One entry per game, so switching tabs, scenes or games keeps each game's open level and its undo stack
 * (Phase 132 Theme D). Never persisted: an unsaved edit lives for the session, as the mode map does.
 */
export const useLevelStore = create<LevelStore>((set) => ({
  byGame: {},
  open: (gameId, scene, data) => set((s) => ({ byGame: { ...s.byGame, [gameId]: openLevelFrom(scene, data) } })),
  update: (gameId, fn) =>
    set((s) => {
      const entry = s.byGame[gameId];
      if (!entry) return s;
      const edit = fn(entry.edit);
      return edit === entry.edit ? s : { byGame: { ...s.byGame, [gameId]: { ...entry, edit } } };
    }),
  newSceneFor: null,
  openNewScene: (gameId) => set({ newSceneFor: gameId }),
  closeNewScene: () => set({ newSceneFor: null }),
  close: (gameId) =>
    set((s) => {
      const { [gameId]: _gone, ...rest } = s.byGame;
      return { byGame: rest };
    }),
}));
