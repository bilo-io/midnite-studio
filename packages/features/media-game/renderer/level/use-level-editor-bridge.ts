import { useEffect } from 'react';

import { levelEntityTypes, type LevelApplyValue, type LevelFrameValue, type LevelViewValue, type GameLevelSelectOutput, type LevelEditorFailure, type LevelEditorRequest, type LevelEditorResult, type LevelEditorSnapshot } from '@midnite/studio-shared';
import { bridge } from '@midnite/studio-frame';

import { addSelected, applyAgentOps, selectOnly, serialise } from './level-edit-model';
import { editorControls } from './level-editor-controls';
import { frameTarget, resolveIds } from './level-frame';
import { selectionBounds } from './level-selection';
import { blockingIssues, useLevelStore, type OpenLevel } from './level-store';

export type LevelEditorAnswer = LevelEditorResult | LevelEditorFailure;
/** How long a `view` of the 3D level waits for the Floorplan -> 3D switch to mount the view. */
export const SHOW_3D_TIMEOUT_MS = 3_000;
const failure = (message: string): LevelEditorFailure => ({ ok: false, kind: 'error', message });

const NOT_OPEN: LevelEditorResult = { handled: false, reason: 'not-open' };

/** The editor cannot be written to: the level is unreadable, or has a problem that opens it read-only. */
export const isReadOnlyLevel = (entry: OpenLevel): boolean => entry.unreadable || blockingIssues(entry).length > 0;

const joinErrors = (errors: readonly { index: number; op: string; message: string }[]): string =>
  errors.map((e) => `op ${e.index} (${e.op}): ${e.message}`).join('; ');

/**
 * `apply` (Phase 138 Theme F): the batch is all-or-nothing and lands as one undo step; the change set is recorded
 * for the banner. A failed batch changes nothing and the errors go back to the agent.
 */
function applyAgentRequest(request: Extract<LevelEditorRequest, { kind: 'apply' }>, entry: OpenLevel): LevelEditorAnswer {
  const store = useLevelStore.getState();
  const entityTypes = levelEntityTypes(serialise(entry.edit));
  const { state, result } = applyAgentOps(entry.edit, request.ops, { unit: request.unit, entityTypes, select: request.select });
  if (!result.ok) return failure(joinErrors(result.errors));
  store.update(request.gameId, () => state);
  const changeSetId = crypto.randomUUID();
  store.recordAgentChange(request.gameId, {
    id: changeSetId,
    label: request.label || 'Agent edit',
    added: result.added,
    updated: result.updated,
    deleted: result.deleted,
    at: Date.now(),
    undoDepth: state.past.length,
  });
  const value: LevelApplyValue = { changeSetId, added: result.added, updated: result.updated, deleted: result.deleted, refs: result.refs };
  return { handled: true, value };
}

/** `select` (Phase 138 Theme G): the found objects become the selection (primary last) and pulse; optionally framed. */
function selectRequest(request: Extract<LevelEditorRequest, { kind: 'select' }>, entry: OpenLevel): LevelEditorAnswer {
  const store = useLevelStore.getState();
  const { refs, found, missing } = resolveIds(entry.edit.level, request.ids);
  store.update(request.gameId, (s) => addSelected(selectOnly(s, null), refs));
  store.setHighlight(request.gameId, found);
  if (request.frame && refs.length > 0) {
    const rect = selectionBounds(entry.edit.level, refs);
    if (rect) editorControls(request.gameId)?.frame(rect, refs);
  }
  const value: GameLevelSelectOutput = { selected: found, missing };
  return { handled: true, value };
}

/** `frame` (Theme G): move the camera over ids, a region or the whole level. */
function frameRequest(request: Extract<LevelEditorRequest, { kind: 'frame' }>, entry: OpenLevel): LevelEditorAnswer {
  const controls = editorControls(request.gameId);
  if (!controls) return NOT_OPEN;
  const target = frameTarget(entry.edit.level, entry.terrain, { ids: request.ids, region: request.region });
  if (!target) return failure(`None of those objects exist in ${request.scene}.`);
  const refs = request.ids ? resolveIds(entry.edit.level, request.ids).refs : [];
  controls.frame(target, refs);
  const value: LevelFrameValue = { view: controls.mode() };
  return { handled: true, value };
}

/**
 * `view` (Theme H): a PNG of the open level. A 2D level is always the plan; a 3D level shows the view asked for,
 * switching Floorplan -> 3D first (and staying there: the agent is showing the user something).
 */
async function viewRequest(request: Extract<LevelEditorRequest, { kind: 'view' }>, entry: OpenLevel): Promise<LevelEditorAnswer> {
  const controls = editorControls(request.gameId);
  if (!controls) return NOT_OPEN;
  let view: 'plan' | '3d' = request.view === 'current' ? controls.mode() : request.view;
  if (view === '3d' && !controls.can3d()) view = 'plan';
  const shot = { preset: request.preset, camera: request.camera, width: request.width, height: request.height };
  if (view === '3d' && controls.mode() !== '3d' && !(await controls.show3d(SHOW_3D_TIMEOUT_MS))) return failure('The 3D view did not open in time.');
  let captured;
  if (view === '3d') captured = await controls.capture3d(shot);
  else {
    const selected = useLevelStore.getState().byGame[request.gameId]?.edit.selected ?? entry.edit.selected;
    captured = await controls.capturePlan({ ...shot, rect: request.preset === 'selection' ? selectionBounds(entry.edit.level, selected) : null });
  }
  if (!captured) return failure('The level could not be captured.');
  const value: LevelViewValue = { png: captured.png, view, width: captured.width, height: captured.height, camera: captured.camera, objects: captured.objects };
  return { handled: true, value };
}

/**
 * Answer one main -> renderer request (Phase 138 Theme C). Pure over the store so it is testable without a
 * bridge: `snapshot` here; `apply` (Theme F), `select`/`frame` (G) and `view` (H) extend the `switch`.
 * A request for a scene the editor does not show is `not-open`.
 */
export function answerLevelEditorRequest(request: Exclude<LevelEditorRequest, { kind: 'view' }>): LevelEditorAnswer;
export function answerLevelEditorRequest(request: LevelEditorRequest): LevelEditorAnswer | Promise<LevelEditorAnswer>;
export function answerLevelEditorRequest(request: LevelEditorRequest): LevelEditorAnswer | Promise<LevelEditorAnswer> {
  const entry = useLevelStore.getState().byGame[request.gameId];
  if (!entry || entry.scene !== request.scene) return NOT_OPEN;
  switch (request.kind) {
    case 'snapshot': {
      if (entry.unreadable) return { handled: false, reason: 'unreadable' };
      const value: LevelEditorSnapshot = { level: serialise(entry.edit), dirty: entry.edit.dirty };
      return { handled: true, value };
    }
    case 'apply':
      if (isReadOnlyLevel(entry)) return { handled: false, reason: 'read-only' };
      return applyAgentRequest(request, entry);
    case 'select':
      return selectRequest(request, entry);
    case 'frame':
      return frameRequest(request, entry);
    case 'view':
      return viewRequest(request, entry);
  }
}

/**
 * Mounted by the one Level editor: reports presence (which scene is open) and answers main's requests. Presence
 * is what lets main skip a round trip, and a timeout, for a scene the editor does not show.
 */
export function useLevelEditorBridge(gameId: string | null): void {
  const scene = useLevelStore((s) => (gameId ? s.byGame[gameId]?.scene : undefined)) ?? null;

  useEffect(() => {
    const games = bridge()?.games.levels;
    if (!games) return;
    games.editorOpen(gameId && scene ? { gameId, scene } : null);
    return () => games.editorOpen(null);
  }, [gameId, scene]);

  useEffect(() => {
    const games = bridge()?.games.levels;
    if (!games) return;
    return games.onEditorRequest(({ id, request }) => {
      const fail = (error: unknown): LevelEditorAnswer => failure(error instanceof Error ? error.message : String(error));
      let answer: LevelEditorAnswer | Promise<LevelEditorAnswer>;
      try {
        answer = answerLevelEditorRequest(request);
      } catch (error) {
        answer = fail(error);
      }
      // Reads answer in the same tick; only `view` (a picture takes a moment) is awaited.
      if (answer instanceof Promise) void answer.catch(fail).then((result) => games.editorReply({ id, result }));
      else games.editorReply({ id, result: answer });
    });
  }, []);
}
