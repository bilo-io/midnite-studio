/**
 * Media ▸ SFX — local sound effects with **Stable Audio Open Small** (Stability AI, 341M-parameter DiT,
 * 44.1 kHz stereo, up to ~11.9 s; made for effects, foley, ambience and short riffs).
 *
 * Opt-in by construction, the SF3D way (`media-model-sf3d.ts`): nothing ships in the bundle and nothing is
 * fetched at startup. The user reads the Stability AI Community License (and its US$1M annual-revenue line)
 * in a consent dialog, accepts, and only then does main download the community ONNX port
 * (`atauser001/stable-audio-open-small-onnx`, ~2.0 GiB, fp32, ungated) into `<userData>/sfx/`, verifying
 * every file's sha256 against the manifest pinned here. Inference runs on the `onnxruntime-node` the app
 * already bundles, in a utility process; the T5 tokenizer is transformers.js's, and the ping-pong sampler
 * is our TypeScript (`sfx/sampler.ts` in the media-audio feature).
 *
 * One IPC channel carries every op (`SfxRequestSchema`), each answering the `GitOpResult` envelope;
 * progress for both the install and a generation arrives on one event channel. Output lands under
 * `.midnite/media/sfx/<project>/` as `<name>.wav` beside a `<name>.json` sidecar.
 */
import { z } from 'zod';

import { MediaProjectNameSchema } from './media';
import { Sf3dAssetSchema, Sf3dConsentSchema, Sf3dInstallProgressSchema, Sf3dStatusSchema, type Sf3dConsent } from './media-model-sf3d';
import { SFX_LICENCE_SHA256 } from './media-sfx-licence';

/** The Hugging Face repository of the ONNX port (not gated). */
export const SFX_REPO = 'atauser001/stable-audio-open-small-onnx';
/** The commit every download resolves against, so a moved `main` can never change what is installed. */
export const SFX_REVISION = '8f9544df5933b9ed4a7e8ed7fa6f77b3dd48ddce';
export const SFX_UPSTREAM_MODEL = 'stabilityai/stable-audio-open-small';
export const SFX_MODEL_LABEL = 'Stable Audio Open Small';
export const SFX_LICENCE_NAME = 'Stability AI Community License';
export const SFX_LICENCE_URL = 'https://stability.ai/community-license-agreement';
export const SFX_ENTERPRISE_URL = 'https://stability.ai/enterprise';
/** Above this annual revenue (the user's or their organisation's) the free licence ends. */
export const SFX_REVENUE_LIMIT_USD = 1_000_000;
/** The licence's attribution line, shown in the tab. */
export const SFX_ATTRIBUTION = 'Powered by Stability AI';

/** The model's own output format. */
export const SFX_SAMPLE_RATE = 44_100;
export const SFX_CHANNELS = 2;
/** Latent frames the DiT always runs over (`sample_size / downsampling_ratio` = 524288 / 2048). */
export const SFX_LATENT_LENGTH = 256;
export const SFX_LATENT_CHANNELS = 64;
export const SFX_DOWNSAMPLING = 2048;
/** T5 tokens per prompt (the conditioner pads or truncates to this). */
export const SFX_TOKEN_LENGTH = 64;
/** The longest clip the model makes: 256 latents × 2048 samples ÷ 44.1 kHz ≈ 11.89 s. */
export const SFX_MAX_SECONDS = Math.floor(((SFX_LATENT_LENGTH * SFX_DOWNSAMPLING) / SFX_SAMPLE_RATE) * 10) / 10;

/** `resolve/<revision>/<path>` on the Hugging Face hub. */
export function sfxFileUrl(path: string, revision: string = SFX_REVISION): string {
  return `https://huggingface.co/${SFX_REPO}/resolve/${revision}/${path}`;
}

export const SfxManifestSchema = z.object({ schemaVersion: z.literal(1), assets: z.record(z.string().min(1), Sf3dAssetSchema) });
export type SfxManifest = z.infer<typeof SfxManifestSchema>;

/**
 * Every file the install fetches, at `SFX_REVISION`, with the sizes and sha256s the Hugging Face API reports
 * for that commit (the port's README lists the same). The port publishes no manifest of its own, so this pin
 * is the only source of truth — a file that hashes differently is discarded.
 */
export const SFX_PINNED_MANIFEST: SfxManifest = {
  schemaVersion: 1,
  assets: {
    'tokenizer.json': { bytes: 1_389_353, sha256: 'd2acde0d8d71dd30a711834b07781b9c89feaac33fd332f60507699282740066' },
    'cond.onnx': { bytes: 439_547_211, sha256: '847822809975d0c36a665594fad0312c4c225147910657820e9936b09014629c' },
    'dec.onnx': { bytes: 312_575_029, sha256: '96029859b4d563f3aff266e97e715190e8d53278c6e27ab94095535a0da4c911' },
    'dit.onnx': { bytes: 1_364_171_978, sha256: '8e9c8b14baac4a26159d5ecf3d365ef5a097f321541f9548d62d136354a23d8b' },
  },
};

/** ~2.0 GiB — what the consent dialog quotes. */
export const SFX_DOWNLOAD_BYTES = Object.values(SFX_PINNED_MANIFEST.assets).reduce((sum, a) => sum + a.bytes, 0);

/** Same shape as SF3D's consent record; a separate file under `<userData>/sfx/`, naming this licence. */
export const SfxConsentSchema = Sf3dConsentSchema;
export type SfxConsent = Sf3dConsent;
export const sfxConsentIsCurrent = (consent: SfxConsent | null): boolean => consent !== null && consent.licenceSha256 === SFX_LICENCE_SHA256;

export const SfxInstallProgressSchema = Sf3dInstallProgressSchema;
export type SfxInstallProgress = z.infer<typeof SfxInstallProgressSchema>;
/** `not-installed` | `installing` | `installed` | `unavailable` (no `onnxruntime-node` in this build). */
export const SfxStatusSchema = Sf3dStatusSchema;
export type SfxStatus = z.infer<typeof SfxStatusSchema>;

// --- generation settings -----------------------------------------------------

/**
 * Every knob a generation takes, with the value a run uses when it is left out. The model is the ARC
 * post-trained ("distilled") variant: 8 ping-pong steps at CFG 1 is what it was tuned for, and it was trained
 * with no CFG dropout, so guidance above 1 (and the negative prompt it enables) is offered but rarely helps.
 */
export const SFX_OPTION_DEFAULTS = {
  /** Clip length in seconds (the model's `seconds_total` conditioning, then a trim). */
  seconds: 3,
  /** Ping-pong sampler steps; each is one DiT pass (two with guidance above 1). */
  steps: 8,
  /** Classifier-free guidance scale. 1 = off (one DiT pass per step). */
  cfgScale: 1,
  /** How many takes to make, each with the next seed. */
  variations: 1,
} as const;
export type SfxOptionKey = keyof typeof SFX_OPTION_DEFAULTS;

/** Slider/input bounds the form and the schema share. */
export const SFX_OPTION_RANGES = {
  seconds: { min: 0.5, max: SFX_MAX_SECONDS, step: 0.1 },
  steps: { min: 1, max: 32, step: 1 },
  cfgScale: { min: 1, max: 7, step: 0.1 },
  variations: { min: 1, max: 4, step: 1 },
} as const satisfies Record<SfxOptionKey, { min: number; max: number; step: number }>;

/** Seeds are 31-bit so they survive JSON, a slider and a file name unchanged. */
export const SFX_SEED_MAX = 2_147_483_647;
export const SFX_PROMPT_MAX = 500;

const ranged = (key: SfxOptionKey) => z.number().min(SFX_OPTION_RANGES[key].min).max(SFX_OPTION_RANGES[key].max);

export const SfxOptionsSchema = z.object({
  seconds: ranged('seconds').optional(),
  steps: ranged('steps').int().optional(),
  cfgScale: ranged('cfgScale').optional(),
  variations: ranged('variations').int().optional(),
  /** Absent → a random seed, recorded in the sidecar and the file name. */
  seed: z.number().int().min(0).max(SFX_SEED_MAX).optional(),
  /** What to steer away from; only used when `cfgScale` > 1 (it replaces the empty unconditional prompt). */
  negativePrompt: z.string().trim().max(SFX_PROMPT_MAX).optional(),
});
export type SfxOptions = z.infer<typeof SfxOptionsSchema>;
export type SfxResolvedOptions = { [K in SfxOptionKey]: number } & { seed: number; negativePrompt: string };

export function resolveSfxOptions(options: SfxOptions | undefined, randomSeed: () => number = () => Math.floor(Math.random() * SFX_SEED_MAX)): SfxResolvedOptions {
  const o = options ?? {};
  return {
    seconds: o.seconds ?? SFX_OPTION_DEFAULTS.seconds,
    steps: o.steps ?? SFX_OPTION_DEFAULTS.steps,
    cfgScale: o.cfgScale ?? SFX_OPTION_DEFAULTS.cfgScale,
    variations: o.variations ?? SFX_OPTION_DEFAULTS.variations,
    seed: o.seed ?? randomSeed(),
    negativePrompt: o.negativePrompt ?? '',
  };
}

const token = (value: number) => String(Math.round(value * 10) / 10).replace('.', 'p');

/**
 * The settings as a file-name suffix — `3s-st12-cfg2p5-neg-s1234` — so takes of one prompt sit side by side
 * and say how they differ. Length and seed are always there (a game asset is picked by both); steps and
 * guidance only when they differ from the defaults, and `neg` when a negative prompt took effect.
 */
export function sfxSettingsSuffix(o: Pick<SfxResolvedOptions, 'seconds' | 'steps' | 'cfgScale' | 'seed' | 'negativePrompt'>): string {
  const parts = [`${token(o.seconds)}s`];
  if (o.steps !== SFX_OPTION_DEFAULTS.steps) parts.push(`st${o.steps}`);
  if (o.cfgScale !== SFX_OPTION_DEFAULTS.cfgScale) parts.push(`cfg${token(o.cfgScale)}`);
  if (o.cfgScale > 1 && o.negativePrompt) parts.push('neg');
  parts.push(`s${o.seed}`);
  return parts.join('-');
}

// --- requests ----------------------------------------------------------------

export const SfxGenerateRequestSchema = z.object({
  generationId: z.string().min(1),
  repoId: z.string().min(1),
  project: MediaProjectNameSchema,
  prompt: z.string().trim().min(1).max(SFX_PROMPT_MAX),
  /** A label for the file; defaults to the prompt. */
  name: z.string().trim().min(1).max(80).optional(),
  options: SfxOptionsSchema.optional(),
});
export type SfxGenerateRequest = z.infer<typeof SfxGenerateRequestSchema>;

export const SfxRequestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('status') }),
  z.object({ op: z.literal('consent'), licenceSha256: z.string(), revenueAcknowledged: z.literal(true) }),
  z.object({ op: z.literal('revokeConsent') }),
  z.object({ op: z.literal('install') }),
  z.object({ op: z.literal('cancelInstall') }),
  z.object({ op: z.literal('uninstall') }),
  SfxGenerateRequestSchema.extend({ op: z.literal('generate') }),
  z.object({ op: z.literal('cancelGenerate'), generationId: z.string().min(1) }),
]);
export type SfxRequest = z.infer<typeof SfxRequestSchema>;

export const SFX_GENERATE_STAGES = ['loading', 'encoding', 'sampling', 'decoding', 'writing'] as const;
export type SfxGenerateStage = (typeof SFX_GENERATE_STAGES)[number];
export const SFX_STAGE_LABELS: Record<SfxGenerateStage, string> = {
  loading: 'Loading Stable Audio Open Small…',
  encoding: 'Reading the prompt (T5)…',
  sampling: 'Denoising (ping-pong sampler)…',
  decoding: 'Decoding the waveform…',
  writing: 'Writing the .wav and its sidecar…',
};

export const SfxProgressEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('install'), progress: SfxInstallProgressSchema }),
  z.object({
    kind: z.literal('generate'),
    generationId: z.string(),
    repoId: z.string(),
    project: z.string(),
    status: z.enum(['running', 'succeeded', 'failed', 'cancelled']),
    stage: z.enum(SFX_GENERATE_STAGES).optional(),
    /** 0..1 over the whole generation (every variation), when known. */
    fraction: z.number().min(0).max(1).optional(),
    /** 1-based take in flight, of `variations`. */
    variation: z.number().int().positive().optional(),
    variations: z.number().int().positive().optional(),
    error: z.string().optional(),
    /** Project-relative paths of the `.wav` files written so far. */
    files: z.array(z.string()).optional(),
  }),
]);
export type SfxProgressEvent = z.infer<typeof SfxProgressEventSchema>;

export const SfxTakeSchema = z.object({ file: z.string(), sidecar: z.string(), seed: z.number().int(), seconds: z.number() });
export const SfxGenerateResultSchema = z.object({
  /** One per variation, in seed order. */
  takes: z.array(SfxTakeSchema),
  /** Wall-clock milliseconds the whole run took. */
  elapsedMs: z.number().nonnegative(),
});
export type SfxGenerateResult = z.infer<typeof SfxGenerateResultSchema>;

/** `<name>.json` beside every `<name>.wav` — the prompt and every setting, so a take can be remade exactly. */
export const SfxSidecarSchema = z.object({
  version: z.literal(1),
  kind: z.literal('sfx'),
  file: z.string(),
  prompt: z.string(),
  negativePrompt: z.string().optional(),
  seconds: z.number(),
  steps: z.number().int(),
  cfgScale: z.number(),
  seed: z.number().int(),
  sampleRate: z.number().int(),
  channels: z.number().int(),
  model: z.object({ name: z.string(), repo: z.string(), revision: z.string(), upstream: z.string() }),
  createdAt: z.string(),
  elapsedMs: z.number().nonnegative().optional(),
});
export type SfxSidecar = z.infer<typeof SfxSidecarSchema>;

export function parseSfxSidecar(text: string): SfxSidecar | null {
  try {
    const parsed = SfxSidecarSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** One-line reason the Generate action is off, or null. */
export function sfxBlockedReason(status: SfxStatus | undefined, prompt: string, running: boolean): string | null {
  if (!status) return 'Checking Stable Audio Open Small…';
  if (status.state === 'unavailable') return status.reason ?? 'Stable Audio Open Small cannot run in this build.';
  if (!sfxConsentIsCurrent(status.consent)) return 'Accept the Stability AI Community License first.';
  if (status.state !== 'installed') return 'Install Stable Audio Open Small first.';
  if (running) return 'A generation is already running.';
  if (!prompt.trim()) return 'Describe the sound.';
  return null;
}
