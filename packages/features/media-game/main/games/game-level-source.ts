import { LevelEditorSnapshotSchema, ok, type GitOpResult } from '@midnite/studio-shared';

import type { GameLevels } from './game-levels';
import type { LevelEditorBridge } from './level-editor-bridge';

/**
 * The level an agent tool should see (Phase 138 Theme D): the open editor's, unsaved edits included, else the
 * committed file. Asks the bridge for a `snapshot`; an editor that does not show the scene, does not answer, or
 * answers something unreadable falls back to `levels.get`. A failing file read returns its failure.
 */
export type LevelForTool = { level: unknown; source: 'editor' | 'file'; dirty: boolean };

export async function readLevelForTool(
  deps: { levels: Pick<GameLevels, 'get'>; levelEditor: Pick<LevelEditorBridge, 'request'> },
  gameId: string,
  scene: string,
): Promise<GitOpResult<LevelForTool>> {
  const asked = await deps.levelEditor.request({ kind: 'snapshot', gameId, scene });
  if (asked.ok && asked.value.handled) {
    const snapshot = LevelEditorSnapshotSchema.safeParse(asked.value.value);
    if (snapshot.success) return ok<LevelForTool>({ level: snapshot.data.level, source: 'editor', dirty: snapshot.data.dirty });
  }
  const file = await deps.levels.get(gameId, scene);
  if (!file.ok) return file;
  return ok<LevelForTool>({ level: file.value.level, source: 'file', dirty: false });
}
