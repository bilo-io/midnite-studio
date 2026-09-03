/**
 * Video Studio (Phase 44) — a **host and a project manager**, not a video
 * renderer. This app ships no Remotion dependency anywhere: a video project
 * is a real npm project on disk the user owns, and main drives it from the
 * outside exactly as it already drives `gh` and Claude — spawn a process,
 * read its output, never link its library. See the phase doc for the size
 * numbers (`@remotion/renderer` alone is ~210 MB unpacked) that rule out any
 * other shape.
 *
 * Global, not per-repo, exactly like councils and workflows — a video
 * project is not a property of an open checkout, so nothing here touches
 * git or carries a `repoId`.
 */
import { z } from 'zod';

// --- project (file format, portable in both directions) --------------------

/**
 * Mirrors `ekko-videos`' own `project.json` **verbatim** — this is a contract
 * with an existing external format, not a new one invented here. A project
 * made by this app opens in that repo unmodified, and a project made there
 * opens in this app unmodified.
 */
export const VideoProjectFileSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  composition: z.string().min(1),
  /** Relative to the project folder, e.g. `input/original.mp4`. */
  source: z.string().min(1),
  /** Relative to the project folder, e.g. `input/BRIEF.md`. */
  brief: z.string().min(1),
  /** Relative to the project folder, e.g. `EDITORIAL_SCRIPT.md`. */
  script: z.string().min(1),
});
export type VideoProjectFile = z.infer<typeof VideoProjectFileSchema>;

/**
 * One discovered project — Theme B's "malformed `project.json` yields a
 * project in an `invalid` state carrying the parse error, listed and greyed
 * — never a crash and never a silently skipped folder." `id` is always the
 * folder name: for a valid project that matches the file's own `id` field by
 * construction (Theme B refuses a mismatch as a form of corruption), and for
 * an invalid one it is the only identity available, since the file itself
 * could not be read.
 */
export const VideoProjectSchema = z.discriminatedUnion('valid', [
  VideoProjectFileSchema.extend({ valid: z.literal(true) }),
  z.object({ valid: z.literal(false), id: z.string().min(1), error: z.string() }),
]);
export type VideoProject = z.infer<typeof VideoProjectSchema>;

// --- composition -------------------------------------------------------------

/**
 * One Remotion composition, as registered in the project's own Remotion
 * entry point — read through the studio's own API surface (Theme C/D), never
 * duplicated by parsing the project's source ourselves.
 */
export const VideoCompositionSchema = z.object({
  id: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive(),
  durationInFrames: z.number().int().positive(),
});
export type VideoComposition = z.infer<typeof VideoCompositionSchema>;

// --- renders -------------------------------------------------------------

/** Mirrors the council/workflow run-status shape: five states, not a boolean. */
export const VIDEO_RENDER_STATUSES = ['queued', 'rendering', 'succeeded', 'failed', 'cancelled'] as const;
export const VideoRenderStatusSchema = z.enum(VIDEO_RENDER_STATUSES);
export type VideoRenderStatus = z.infer<typeof VideoRenderStatusSchema>;

/**
 * One tracked render. `outputFile` names the `vN-<label>.mp4` Theme B reads
 * back off `<project>/output/` once the render actually lands there — this
 * record is main's in-memory/tracked view of the *process*, not a second
 * source of truth for what is on disk; the iteration number is never counted
 * here, only ever derived from a directory listing.
 */
export const VideoRenderSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  compositionId: z.string().min(1),
  status: VideoRenderStatusSchema,
  outputFile: z.string().optional(),
  error: z.string().optional(),
  startedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative().optional(),
});
export type VideoRender = z.infer<typeof VideoRenderSchema>;

// --- studio (the hosted `remotion studio` dev server) -------------------------

/**
 * A studio with no URL yet is a *state*, not a null field — the view renders
 * each of the four differently (a Start button, a spinner naming the port
 * being waited on, the hosted studio, or the failure with its stderr).
 */
export const VideoStudioStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('stopped') }),
  z.object({ state: z.literal('starting') }),
  z.object({ state: z.literal('running'), url: z.string() }),
  /**
   * Carries the studio's last stderr lines — Theme C's own rule: "a dev
   * server that dies silently is the single most confusing failure this
   * feature can have."
   */
  z.object({ state: z.literal('failed'), stderr: z.array(z.string()) }),
]);
export type VideoStudioStatus = z.infer<typeof VideoStudioStatusSchema>;

// --- toolchain -----------------------------------------------------------

/**
 * One resolved (or unresolved) binary. A discriminated union rather than an
 * optional path plus a separate error string, so a consumer cannot read
 * `path` without having narrowed `found` first.
 */
export const VideoToolBinarySchema = z.discriminatedUnion('found', [
  z.object({ found: z.literal(true), path: z.string().min(1) }),
  z.object({ found: z.literal(false), reason: z.string() }),
]);
export type VideoToolBinary = z.infer<typeof VideoToolBinarySchema>;

/**
 * `node`/`npx`, resolved through the existing login-shell probe (Theme C) —
 * a GUI-launched app does not inherit a login shell's PATH, and this repo
 * already solved that once for `gh`. `remotionVersion` is read from the
 * project's own `package.json`, so it is per-project and absent until one
 * has actually been inspected.
 */
export const VideoToolchainSchema = z.object({
  node: VideoToolBinarySchema,
  npx: VideoToolBinarySchema,
  remotionVersion: z.string().optional(),
});
export type VideoToolchain = z.infer<typeof VideoToolchainSchema>;

// --- push events -----------------------------------------------------------

/** Pushed on `mstudio:video:studio-changed` — one event per project, not one channel per field. */
export const VideoStudioChangedEventSchema = z.object({
  projectId: z.string().min(1),
  status: VideoStudioStatusSchema,
});
export type VideoStudioChangedEvent = z.infer<typeof VideoStudioChangedEventSchema>;

/** Pushed on `mstudio:video:render-progress`. `progress` is absent whenever Remotion's own render reporter has not produced a fraction yet. */
export const VideoRenderProgressEventSchema = z.object({
  renderId: z.string().min(1),
  projectId: z.string().min(1),
  status: VideoRenderStatusSchema,
  progress: z.number().min(0).max(1).optional(),
});
export type VideoRenderProgressEvent = z.infer<typeof VideoRenderProgressEventSchema>;
