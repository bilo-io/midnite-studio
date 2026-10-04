/**
 * Media ▸ Models — Tier 1, local neural image-to-3D with **SF3D** (Stable Fast 3D), Phase 103 Theme J.
 *
 * Opt-in by construction: nothing ships in the bundle and nothing is fetched at startup. The user
 * reads the Stability AI Community License (and its US$1M annual-revenue line) in a consent dialog,
 * accepts, and only then does main download the community ONNX port (`needle-tools/SF3D-webgpu`,
 * ~1.73 GB) into `<userData>/sf3d/`, verifying every file's sha256 against the pinned
 * `assets-manifest.json`. Inference runs on the `onnxruntime-node` the app already bundles, in a
 * utility process; meshing, the UV atlas, the texture bake and the `.glb` are our TypeScript.
 *
 * One IPC channel carries every op (`MediaModelSf3dRequestSchema`), each answering the `GitOpResult`
 * envelope; progress for both the install and a generation arrives on one event channel.
 */
import { z } from 'zod';

import { MediaProjectNameSchema } from './media';
import { ModelImageAttachmentSchema } from './media-model';
import { SF3D_LICENCE_SHA256 } from './media-model-sf3d-licence';

export { SF3D_LICENCE_SHA256, SF3D_LICENCE_TEXT } from './media-model-sf3d-licence';

/** The Hugging Face repository of the ONNX port (not gated). */
export const SF3D_REPO = 'needle-tools/SF3D-webgpu';
/** The commit every download resolves against, so a moved `main` can never change what is installed. */
export const SF3D_REVISION = '56d2f58d27395b0be9c633671b439b4aac482549';
export const SF3D_UPSTREAM_MODEL = 'stabilityai/stable-fast-3d';
export const SF3D_LICENCE_NAME = 'Stability AI Community License';
export const SF3D_LICENCE_URL = 'https://stability.ai/community-license-agreement';
export const SF3D_ENTERPRISE_URL = 'https://stability.ai/enterprise';
/** Above this annual revenue (the user's or their organisation's) the free licence ends. */
export const SF3D_REVENUE_LIMIT_USD = 1_000_000;
/** The `agent.provider` an SF3D model's `model.json` names. */
export const SF3D_PROVIDER = 'sf3d';

/** `resolve/<revision>/<path>` on the Hugging Face hub. */
export function sf3dFileUrl(path: string, revision: string = SF3D_REVISION): string {
  return `https://huggingface.co/${SF3D_REPO}/resolve/${revision}/${path}`;
}

export const Sf3dAssetSchema = z.object({ bytes: z.number().int().positive(), sha256: z.string().regex(/^[0-9a-f]{64}$/) });
export const Sf3dManifestSchema = z.object({
  schemaVersion: z.literal(1),
  assets: z.record(z.string().min(1), Sf3dAssetSchema),
});
export type Sf3dManifest = z.infer<typeof Sf3dManifestSchema>;

/**
 * `assets-manifest.json` at `SF3D_REVISION`, pinned. The installer downloads the upstream copy too and
 * refuses to continue if it disagrees — the pin is what the consent dialog's size and the verify step use.
 */
export const SF3D_PINNED_MANIFEST: Sf3dManifest = {
  schemaVersion: 1,
  assets: {
    'onnx/image_tokenizer_single.onnx': { bytes: 763_808_910, sha256: 'cc8c76276a9cf86ece8a854827ed570bdbf71e458df09bde5664af46af29c21e' },
    'onnx/backbone_fp16.onnx': { bytes: 911_863_351, sha256: '8bcde6d22589e8bbb753c4ca1a91f2c800f27a794b75405ef0dbee6b07b0da12' },
    'onnx/decoder_single.onnx': { bytes: 104_430, sha256: 'ec4655df567128cc86b18b8a86b7b79d092d5223c8521a6d9993d08209e2785d' },
    'tets_vertices.bin': { bytes: 6_430_584, sha256: '16f4ee01a050d1757c19b13a7e1dbd4d0918d08208d961c105ff74cbfc345dac' },
    'tets_indices.bin': { bytes: 47_543_232, sha256: '606cc8b47f8744a64ff6f1f3c088d9d9113ff80539bd62cb1651f8dc629d1f1e' },
    'features_mlp_weights.json': { bytes: 349_798, sha256: 'b493e908039ebb70bf99f451b3ff85dc70cb2a62b29cefd17453ebdf27b8b4d7' },
  },
};

export function manifestBytes(manifest: Sf3dManifest): number {
  return Object.values(manifest.assets).reduce((sum, a) => sum + a.bytes, 0);
}

/** ~1.73 GB — what the consent dialog quotes. */
export const SF3D_DOWNLOAD_BYTES = manifestBytes(SF3D_PINNED_MANIFEST);

export const Sf3dConsentSchema = z.object({
  /** sha256 of the licence text the user accepted. */
  licenceSha256: z.string().regex(/^[0-9a-f]{64}$/),
  acceptedAt: z.string().min(1),
  /** The user confirmed they (and their organisation) are under `SF3D_REVENUE_LIMIT_USD`, or hold an Enterprise licence. */
  revenueAcknowledged: z.literal(true),
});
export type Sf3dConsent = z.infer<typeof Sf3dConsentSchema>;

/** Whether a stored consent still covers the licence this build ships. */
export const consentIsCurrent = (consent: Sf3dConsent | null): boolean => consent !== null && consent.licenceSha256 === SF3D_LICENCE_SHA256;

export const SF3D_INSTALL_PHASES = ['manifest', 'download', 'verify', 'ready', 'failed', 'cancelled'] as const;
export const Sf3dInstallProgressSchema = z.object({
  phase: z.enum(SF3D_INSTALL_PHASES),
  /** The file in flight, relative to the install directory. */
  file: z.string().optional(),
  receivedBytes: z.number().nonnegative(),
  totalBytes: z.number().nonnegative(),
  /** 0..1 over the whole install. */
  fraction: z.number().min(0).max(1),
  message: z.string().optional(),
});
export type Sf3dInstallProgress = z.infer<typeof Sf3dInstallProgressSchema>;

/**
 * `not-installed` — nothing on disk (maybe partial downloads, which a resume picks up);
 * `installing` — a download/verify is running; `installed` — every asset verified;
 * `unavailable` — this build cannot run it (no `onnxruntime-node`).
 */
export const SF3D_STATES = ['not-installed', 'installing', 'installed', 'unavailable'] as const;
export type Sf3dState = (typeof SF3D_STATES)[number];

export const Sf3dStatusSchema = z.object({
  state: z.enum(SF3D_STATES),
  consent: Sf3dConsentSchema.nullable(),
  /** Verified plus partial bytes already on disk. */
  bytesOnDisk: z.number().nonnegative(),
  totalBytes: z.number().nonnegative(),
  progress: Sf3dInstallProgressSchema.optional(),
  /** The last install or uninstall problem, until the next attempt. */
  error: z.string().optional(),
  reason: z.string().optional(),
});
export type Sf3dStatus = z.infer<typeof Sf3dStatusSchema>;

/** Texture atlas edge, in texels; the bake queries the colour MLP once per covered texel. */
export const SF3D_TEXTURE_SIZES = [512, 1024, 2048] as const;
export const SF3D_DEFAULT_TEXTURE_SIZE = 1024;

export const Sf3dGenerateRequestSchema = z.object({
  generationId: z.string().min(1),
  repoId: z.string().min(1),
  project: MediaProjectNameSchema,
  image: ModelImageAttachmentSchema,
  /** A label for the model; defaults to the image's file name. */
  name: z.string().trim().min(1).max(80).optional(),
  textureSize: z.union([z.literal(512), z.literal(1024), z.literal(2048)]).optional(),
});
export type Sf3dGenerateRequest = z.infer<typeof Sf3dGenerateRequestSchema>;

export const MediaModelSf3dRequestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('status') }),
  z.object({ op: z.literal('consent'), licenceSha256: z.string(), revenueAcknowledged: z.literal(true) }),
  z.object({ op: z.literal('revokeConsent') }),
  z.object({ op: z.literal('install') }),
  z.object({ op: z.literal('cancelInstall') }),
  z.object({ op: z.literal('uninstall') }),
  Sf3dGenerateRequestSchema.extend({ op: z.literal('generate') }),
  z.object({ op: z.literal('cancelGenerate'), generationId: z.string().min(1) }),
]);
export type MediaModelSf3dRequest = z.infer<typeof MediaModelSf3dRequestSchema>;

export const SF3D_GENERATE_STAGES = ['preparing', 'loading', 'tokenizing', 'backbone', 'decoding', 'meshing', 'texturing', 'writing'] as const;
export type Sf3dGenerateStage = (typeof SF3D_GENERATE_STAGES)[number];
export const SF3D_STAGE_LABELS: Record<Sf3dGenerateStage, string> = {
  preparing: 'Preparing the picture…',
  loading: 'Loading the SF3D model…',
  tokenizing: 'Reading the picture (image tokenizer)…',
  backbone: 'Predicting the triplane (backbone)…',
  decoding: 'Querying density on the tet grid…',
  meshing: 'Extracting the surface (marching tetrahedra)…',
  texturing: 'Unwrapping and baking the texture…',
  writing: 'Writing the .glb and model.json…',
};

export const Sf3dProgressEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('install'), progress: Sf3dInstallProgressSchema }),
  z.object({
    kind: z.literal('generate'),
    generationId: z.string(),
    repoId: z.string(),
    project: z.string(),
    status: z.enum(['running', 'succeeded', 'failed', 'cancelled']),
    stage: z.enum(SF3D_GENERATE_STAGES).optional(),
    /** 0..1 within the stage, when it has one. */
    fraction: z.number().min(0).max(1).optional(),
    error: z.string().optional(),
    primary: z.string().optional(),
  }),
]);
export type Sf3dProgressEvent = z.infer<typeof Sf3dProgressEventSchema>;

export const Sf3dGenerateResultSchema = z.object({
  files: z.array(z.string()),
  /** The `.glb`, relative to the project — what the explorer opens. */
  primary: z.string(),
  vertices: z.number().int().nonnegative(),
  triangles: z.number().int().nonnegative(),
});
export type Sf3dGenerateResult = z.infer<typeof Sf3dGenerateResultSchema>;

/** One-line reason the Generate action is off, or null. */
export function sf3dBlockedReason(status: Sf3dStatus | undefined, hasImage: boolean, running: boolean): string | null {
  if (!status) return 'Checking SF3D…';
  if (status.state === 'unavailable') return status.reason ?? 'SF3D cannot run in this build.';
  if (!consentIsCurrent(status.consent)) return 'Accept the Stability AI Community License first.';
  if (status.state !== 'installed') return 'Install SF3D first.';
  if (running) return 'A generation is already running.';
  if (!hasImage) return 'Attach a picture of one object.';
  return null;
}
