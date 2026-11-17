import { z } from 'zod';

import { GitOpFailureSchema } from './domain/result';
import { LEVEL_OPS_MAX, LevelOpSchema, LevelQuerySchema } from './game-level-ops';
import { GameSceneNameSchema } from './media-game';

/**
 * The main -> renderer level-editor bridge (Phase 138 Theme C): the wire shapes. Main sends a request on
 * `EVENT_CHANNELS.gamesLevelEditorRequest` as `{ id, request }`; the renderer answers one-way on
 * `CHANNELS.gamesLevelEditorReply` as `{ id, result }`. A request for a scene the editor does not show is
 * answered `{ handled: false }` and the caller falls back to the file.
 */

/** A camera pose for the `view` request (Theme H refines how it is used; the wire shape is fixed here). */
export const LevelViewCameraSchema = z.object({
  position: z.tuple([z.number(), z.number(), z.number()]),
  target: z.tuple([z.number(), z.number(), z.number()]),
  fov: z.number().min(10).max(120).optional(),
});
export type LevelViewCamera = z.infer<typeof LevelViewCameraSchema>;

export const LevelEditorRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('snapshot'), gameId: z.string(), scene: GameSceneNameSchema }),
  z.object({
    kind: z.literal('apply'),
    gameId: z.string(),
    scene: GameSceneNameSchema,
    ops: z.array(LevelOpSchema).min(1).max(LEVEL_OPS_MAX),
    unit: z.enum(['px', 'm']),
    label: z.string().max(80),
    select: z.boolean(),
  }),
  z.object({ kind: z.literal('select'), gameId: z.string(), scene: GameSceneNameSchema, ids: z.array(z.number().int()).max(1000), frame: z.boolean() }),
  z.object({
    kind: z.literal('frame'),
    gameId: z.string(),
    scene: GameSceneNameSchema,
    ids: z.array(z.number().int()).max(1000).optional(),
    region: LevelQuerySchema.shape.region,
  }),
  z.object({
    kind: z.literal('view'),
    gameId: z.string(),
    scene: GameSceneNameSchema,
    view: z.enum(['plan', '3d', 'current']),
    camera: LevelViewCameraSchema.optional(),
    preset: z.enum(['top', 'iso', 'selection', 'current']),
    width: z.number().int(),
    height: z.number().int(),
  }),
]);
export type LevelEditorRequest = z.infer<typeof LevelEditorRequestSchema>;
export type LevelEditorRequestKind = LevelEditorRequest['kind'];

/** What main pushes to the renderer. */
export const GamesLevelEditorRequestPayload = z.object({ id: z.string().uuid(), request: LevelEditorRequestSchema });
export type LevelEditorRequestPayload = z.infer<typeof GamesLevelEditorRequestPayload>;

export const LevelEditorResultSchema = z.discriminatedUnion('handled', [
  z.object({ handled: z.literal(false), reason: z.enum(['not-open', 'read-only', 'unreadable']) }),
  /** `value` is per request kind; the caller parses it with that kind's own schema. */
  z.object({ handled: z.literal(true), value: z.unknown() }),
]);
export type LevelEditorResult = z.infer<typeof LevelEditorResultSchema>;

export const GamesLevelEditorReply = z.object({ id: z.string().uuid(), result: z.union([LevelEditorResultSchema, GitOpFailureSchema]) });
/** A failure envelope (`GitOpResult`'s `ok: false` arm). */
export type LevelEditorFailure = z.infer<typeof GitOpFailureSchema>;
export type LevelEditorReply = z.infer<typeof GamesLevelEditorReply>;

/** The `snapshot` answer's `value`: the serialised edit level (Tiled JSON) and whether it has unsaved edits. */
export const LevelEditorSnapshotSchema = z.object({ level: z.unknown(), dirty: z.boolean() });
export type LevelEditorSnapshot = z.infer<typeof LevelEditorSnapshotSchema>;

/** One-way presence: which scene the editor shows (or `null` once it closes). */
export const GamesLevelEditorOpenPayload = z.object({ gameId: z.string(), scene: GameSceneNameSchema }).nullable();
export type LevelEditorOpenPayload = z.infer<typeof GamesLevelEditorOpenPayload>;
