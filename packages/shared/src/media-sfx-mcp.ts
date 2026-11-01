/**
 * `sfx_status` and `sfx_generate` — Media ▸ SFX (Stable Audio Open Small) on the `midnite` MCP server, so a
 * game or a video an agent is building can have its sound effects made locally.
 *
 * An agent can *use* the model once the user has installed it, never install it: the licence consent and the
 * 2 GB download are the user's alone, so a not-ready model answers a refusal (and `sfx_status` a `hint`)
 * telling the agent to ask the user to open Media ▸ SFX. `sfx_generate` starts a run and returns at once —
 * a few takes at more steps outlast the shim's 60 s call timeout — and `sfx_status({ generationId })`
 * reports it until it names the `.wav` files.
 */
import { z } from 'zod';

import { MediaProjectNameSchema } from './media';
import { SF3D_STATES } from './media-model-sf3d';
import { SFX_GENERATE_STAGES, SFX_PROMPT_MAX, SfxOptionsSchema } from './media-sfx';

/** What an agent is told when the model is not installed or its licence not accepted. */
export const SFX_NOT_READY_HINT =
  'Ask the user to open Media ▸ SFX, read and accept the Stability AI Community License, and install Stable Audio Open Small (~2.1 GB) — an agent cannot accept the licence or start the download for them.';

export const SfxMcpStatusInputSchema = z.object({
  /** An `sfx_generate` run to report on. */
  generationId: z.string().min(1).max(200).optional(),
});

export const SfxMcpStatusResultSchema = z.object({
  state: z.enum(SF3D_STATES),
  installed: z.boolean(),
  consentCurrent: z.boolean(),
  licence: z.object({ name: z.string(), url: z.string(), revenueLimitUsd: z.number(), attribution: z.string() }),
  downloadBytes: z.number(),
  bytesOnDisk: z.number(),
  /** What to tell the user when the model is not ready. */
  hint: z.string().optional(),
  generation: z
    .object({
      generationId: z.string(),
      project: z.string(),
      status: z.enum(['running', 'succeeded', 'failed', 'cancelled']),
      stage: z.enum(SFX_GENERATE_STAGES).optional(),
      fraction: z.number().optional(),
      error: z.string().optional(),
      /** Repo-relative `.wav` paths written so far (`.midnite/media/sfx/<project>/<file>`), each beside its `.json` sidecar. */
      files: z.array(z.string()).optional(),
    })
    .optional(),
});

export const SfxMcpGenerateInputSchema = z.object({
  repoPath: z.string().min(1),
  /** The SFX project (folder) the takes land in — e.g. the game's or the video's name. */
  project: MediaProjectNameSchema,
  /** The sound, in plain words: "laser zap, sci-fi blaster", "footsteps on gravel". */
  prompt: z.string().trim().min(1).max(SFX_PROMPT_MAX),
  /** A label for the file name; defaults to the prompt. */
  name: z.string().trim().min(1).max(80).optional(),
  options: SfxOptionsSchema.optional(),
});

export const SfxMcpGenerateResultSchema = z.object({ started: z.literal(true), generationId: z.string() });
