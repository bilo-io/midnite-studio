import type { GameLevelGetResult, GameLevelTerrain } from '@midnite/studio-shared';
import { create } from 'zustand';

import { createEditState, toEditLevel, type EditState } from './level-edit-model';
import type { PlanHighlight } from './level-plan-draw';

/** One agent `apply` (Phase 138 Theme F), reviewable in the banner until the user keeps it. */
export type AgentChangeSet = {
  id: string;
  label: string;
  added: number[];
  updated: number[];
  deleted: number[];
  at: number;
  /** `edit.past.length` right after the commit: Undo is offered only while nothing was done after it. */
  undoDepth: number;
};
export const AGENT_CHANGES_MAX = 10;

/** What the editor has open for one game: the scene, its edit state (with the undo stack), issues and images. */
export type OpenLevel = {
  scene: string;
  edit: EditState;
  /** `parseGameLevel`'s issues; any means the level opens read-only. */
  issues: string[];
  images: GameLevelGetResult['images'];
  /** A 3D level's terrain extent, drawn under the plan (Phase 132 Theme E). */
  terrain: GameLevelTerrain | null;
  /** The level is not a map the editor can hold (not JSON, or unreadable). */
  unreadable: boolean;
  /** Agent change sets awaiting review, newest first (max {@link AGENT_CHANGES_MAX}). */
  agentChanges: AgentChangeSet[];
  /** The objects the newest change set touched, ringed for a couple of seconds. */
  highlight: PlanHighlight | null;
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
  /** Remember an applied agent change set and pulse the objects it touched. */
  recordAgentChange: (gameId: string, change: AgentChangeSet) => void;
  /** Keep (dismiss) one change set from the banner. */
  dismissAgentChange: (gameId: string, id: string) => void;
  /** Pulse these objects (Show in the banner). */
  setHighlight: (gameId: string, ids: readonly number[]) => void;
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
    return { scene, edit: createEditState({ orientation: 'orthogonal', width: 1, height: 1, tilewidth: 1, tileheight: 1, layers: [], tilesets: [] }), issues: issues.length ? issues : ['This is not a Tiled map.'], images: data.images, terrain: null, unreadable: true, agentChanges: [], highlight: null };
  }
  return { scene, edit: createEditState(level), issues, images: data.images, terrain: data.terrain ?? null, unreadable: false, agentChanges: [], highlight: null };
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
  recordAgentChange: (gameId, change) =>
    set((s) => {
      const entry = s.byGame[gameId];
      if (!entry) return s;
      const ids = [...change.added, ...change.updated];
      const agentChanges = [change, ...entry.agentChanges].slice(0, AGENT_CHANGES_MAX);
      return { byGame: { ...s.byGame, [gameId]: { ...entry, agentChanges, highlight: ids.length ? { ids, startedAt: change.at } : entry.highlight } } };
    }),
  dismissAgentChange: (gameId, id) =>
    set((s) => {
      const entry = s.byGame[gameId];
      if (!entry) return s;
      return { byGame: { ...s.byGame, [gameId]: { ...entry, agentChanges: entry.agentChanges.filter((c) => c.id !== id) } } };
    }),
  setHighlight: (gameId, ids) =>
    set((s) => {
      const entry = s.byGame[gameId];
      if (!entry) return s;
      return { byGame: { ...s.byGame, [gameId]: { ...entry, highlight: ids.length ? { ids, startedAt: Date.now() } : null } } };
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
