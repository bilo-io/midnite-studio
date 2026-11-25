import {
  LevelApplyValueSchema,
  LevelEditorSnapshotSchema,
  applyLevelOps,
  failure,
  levelEntityTypes,
  ok,
  validateLevel,
  type GameEntityWriteOutput,
  type GamePrefab,
  type GitOpResult,
  type LevelIssue,
  type LevelOp,
} from '@midnite/studio-shared';

import type { GameLevels } from './game-levels';
import { LEVEL_EDITOR_TIMEOUT_MESSAGE, type LevelEditorBridge } from './level-editor-bridge';

/**
 * The write path behind `game_entity_*` (Phase 138 Theme E). With the editor showing the scene, the ops are applied
 * there as one undoable change set (Theme F); otherwise they are applied to the file and committed once. Either way
 * a batch is all-or-nothing: a bad op writes nothing and the failure names each op's index.
 */
export type LevelAgentWriteDeps = {
  levels: Pick<GameLevels, 'get' | 'set'>;
  levelEditor: Pick<LevelEditorBridge, 'request'>;
  /** The game's model asset names, or `null` when its manifest cannot say (the model-missing rule is skipped). */
  modelAssets: (gameId: string) => Promise<readonly string[] | null>;
  /** One prefab file by name (Phase 139 Theme I), `null` when it is missing or invalid; needed for `place-prefab` ops. */
  prefab?: (gameId: string, name: string) => Promise<GamePrefab | null>;
};

export type LevelAgentWriteRequest = {
  gameId: string;
  scene: string;
  ops: LevelOp[];
  unit: 'px' | 'm';
  label?: string | undefined;
  save: boolean;
  select: boolean;
};

const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** "Add 3 objects", "Update 2 objects", "Delete 1 object", or "Edit 6 objects" for a mixed batch. */
export function defaultLevelWriteLabel(ops: readonly LevelOp[]): string {
  const kinds = new Set(ops.map((op) => op.op));
  const n = ops.length;
  if (kinds.size === 1 && kinds.has('place-prefab')) return `Place ${plural(n, 'prefab')}`;
  if (kinds.size === 1) {
    const verb = kinds.has('add') ? 'Add' : kinds.has('update') ? 'Update' : 'Delete';
    return `${verb} ${plural(n, 'object')}`;
  }
  return `Edit ${plural(n, 'object')}`;
}

const joinErrors = (errors: readonly { index: number; op: string; message: string }[]): string =>
  errors.map((e) => `op ${e.index} (${e.op}): ${e.message}`).join('; ');

async function issuesFor(deps: LevelAgentWriteDeps, gameId: string, level: unknown): Promise<LevelIssue[]> {
  const modelAssets = await deps.modelAssets(gameId).catch(() => null);
  return validateLevel(level, { entityTypes: levelEntityTypes(level), modelAssets })
    .filter((issue) => issue.severity !== 'info')
    .slice(0, 50);
}

/** The prefab files the batch's `place-prefab` ops name; a missing one is left out so the op reports it by name. */
async function prefabsFor(deps: LevelAgentWriteDeps, gameId: string, ops: readonly LevelOp[]): Promise<Record<string, GamePrefab>> {
  const out: Record<string, GamePrefab> = {};
  if (!deps.prefab) return out;
  for (const op of ops) {
    if (op.op !== 'place-prefab' || op.prefab in out) continue;
    const prefab = await deps.prefab(gameId, op.prefab).catch(() => null);
    if (prefab) out[op.prefab] = prefab;
  }
  return out;
}

export async function writeLevelOps(deps: LevelAgentWriteDeps, req: LevelAgentWriteRequest): Promise<GitOpResult<GameEntityWriteOutput>> {
  const prefabs = await prefabsFor(deps, req.gameId, req.ops);
  const label = req.label ?? defaultLevelWriteLabel(req.ops);
  const asked = await deps.levelEditor.request({
    kind: 'apply',
    gameId: req.gameId,
    scene: req.scene,
    ops: req.ops,
    unit: req.unit,
    label,
    select: req.select,
    ...(Object.keys(prefabs).length ? { prefabs } : {}),
  });

  if (!asked.ok) {
    // A timeout falls back to the file; any other failure (the batch was invalid) is the answer.
    if (!('message' in asked) || asked.message !== LEVEL_EDITOR_TIMEOUT_MESSAGE) return asked;
  } else if (asked.value.handled) {
    const applied = LevelApplyValueSchema.safeParse(asked.value.value);
    if (!applied.success) return failure('The level editor answered something unreadable.');
    return finishEditorWrite(deps, req, applied.data);
  } else if (asked.value.reason === 'read-only') {
    return failure('The level is open read-only in the editor.');
  }
  return writeToFile(deps, req, prefabs);
}

async function finishEditorWrite(
  deps: LevelAgentWriteDeps,
  req: LevelAgentWriteRequest,
  applied: { changeSetId: string; added: number[]; updated: number[]; deleted: number[]; refs: Record<string, number> },
): Promise<GitOpResult<GameEntityWriteOutput>> {
  let issues: LevelIssue[] = [];
  let sha: string | null = null;
  let saved = false;
  const snap = await deps.levelEditor.request({ kind: 'snapshot', gameId: req.gameId, scene: req.scene });
  const snapshot = snap.ok && snap.value.handled ? LevelEditorSnapshotSchema.safeParse(snap.value.value) : null;
  if (snapshot?.success) {
    issues = await issuesFor(deps, req.gameId, snapshot.data.level);
    if (req.save) {
      const written = await deps.levels.set(req.gameId, req.scene, snapshot.data.level);
      if (!written.ok) return written;
      saved = true;
      sha = written.value.sha;
    }
  } else if (req.save) {
    return failure('The change was applied in the editor, but its level could not be read back to save.');
  }
  return ok<GameEntityWriteOutput>({ applied: 'editor', changeSetId: applied.changeSetId, ...pick(applied), saved, sha, issues });
}

const pick = (a: { added: number[]; updated: number[]; deleted: number[]; refs: Record<string, number> }) => ({
  added: a.added,
  updated: a.updated,
  deleted: a.deleted,
  refs: a.refs,
});

async function writeToFile(deps: LevelAgentWriteDeps, req: LevelAgentWriteRequest, prefabs: Record<string, GamePrefab>): Promise<GitOpResult<GameEntityWriteOutput>> {
  const file = await deps.levels.get(req.gameId, req.scene);
  if (!file.ok) return file;
  const result = applyLevelOps(file.value.level, req.ops, { unit: req.unit, entityTypes: levelEntityTypes(file.value.level), prefabs });
  if (!result.ok) return failure(joinErrors(result.errors));
  const written = await deps.levels.set(req.gameId, req.scene, result.level);
  if (!written.ok) return written;
  return ok<GameEntityWriteOutput>({
    applied: 'file',
    changeSetId: null,
    ...pick(result),
    saved: true,
    sha: written.value.sha,
    issues: await issuesFor(deps, req.gameId, result.level),
  });
}
