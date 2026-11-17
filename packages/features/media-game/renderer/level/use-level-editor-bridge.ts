import { useEffect } from 'react';

import { type LevelEditorFailure, type LevelEditorRequest, type LevelEditorResult, type LevelEditorSnapshot } from '@midnite/studio-shared';
import { bridge } from '@midnite/studio-frame';

import { serialise } from './level-edit-model';
import { blockingIssues, useLevelStore, type OpenLevel } from './level-store';

export type LevelEditorAnswer = LevelEditorResult | LevelEditorFailure;
const failure = (message: string): LevelEditorFailure => ({ ok: false, kind: 'error', message });

const NOT_OPEN: LevelEditorResult = { handled: false, reason: 'not-open' };

/** The editor cannot be written to: the level is unreadable, or has a problem that opens it read-only. */
export const isReadOnlyLevel = (entry: OpenLevel): boolean => entry.unreadable || blockingIssues(entry).length > 0;

/**
 * Answer one main -> renderer request (Phase 138 Theme C). Pure over the store so it is testable without a
 * bridge: `snapshot` here; `apply` (Theme F), `select`/`frame` (G) and `view` (H) extend the `switch`.
 * A request for a scene the editor does not show is `not-open`.
 */
export function answerLevelEditorRequest(request: LevelEditorRequest): LevelEditorAnswer {
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
      return failure('this editor build cannot apply agent edits yet');
    default:
      return failure(`this editor build does not handle "${request.kind}" requests yet`);
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
      let result: LevelEditorAnswer;
      try {
        result = answerLevelEditorRequest(request);
      } catch (error) {
        result = failure(error instanceof Error ? error.message : String(error));
      }
      games.editorReply({ id, result });
    });
  }, []);
}
