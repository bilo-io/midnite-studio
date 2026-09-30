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
 * The two fixed Claude skills `ekko-videos` carries — the exact
 * `/command` invocation each of `video-project-detail.tsx`'s "Write
 * editorial script"/"Execute editorial script" actions types into a
 * terminal. Shared (not `app`-local) because Theme F's own presence probe
 * (`toolchain.ts`'s `probeVideoSkills`) needs the same two identifiers to
 * derive the `.claude/skills/<name>/` directory each command expects to
 * find in the video root — a skill's directory name is always its slash
 * command with the leading `/` stripped, the same convention this repo's
 * own `.claude/skills/` follows. Deliberately **not** routed through
 * `DEFAULT_AGENT_SKILLS`/`AgentCommandId` (`ui-store.ts`) — see
 * `video-project-detail.tsx`'s own comment for why.
 */
export const VIDEO_SKILLS = {
  videoWriteScript: '/video-write-editorial-script',
  videoExecuteScript: '/video-execute-editorial-script',
} as const;
export type VideoSkillId = keyof typeof VIDEO_SKILLS;

/**
 * `node`/`npx`, resolved through the existing login-shell probe (Theme C) —
 * a GUI-launched app does not inherit a login shell's PATH, and this repo
 * already solved that once for `gh`. `remotionVersion` is read from the
 * project's own `package.json`, so it is per-project and absent until one
 * has actually been inspected. `skills` is the Theme F follow-up: whether
 * each of `VIDEO_SKILLS` actually exists in the video root's own
 * `.claude/skills/`, in the same found/reason shape as `node`/`npx` so the
 * UI treats a missing skill exactly like a missing binary.
 */
export const VideoToolchainSchema = z.object({
  node: VideoToolBinarySchema,
  npx: VideoToolBinarySchema,
  remotionVersion: z.string().optional(),
  /** Phase 99 Theme A — the Media export service's required external tool. Optional so older fixtures stay valid. */
  ffmpeg: VideoToolBinarySchema.optional(),
  skills: z.object({
    videoWriteScript: VideoToolBinarySchema,
    videoExecuteScript: VideoToolBinarySchema,
  }),
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

// --- Phase 99 Theme D: Media ▸ Video -----------------------------------------

/**
 * Where the Video tab's root came from, in resolution order:
 * 1. `repo` — the active repo itself has the midnite-videos layout
 *    (`video-editor/` + `projects/`);
 * 2. `repo-media` — `<repo>/.midnite/media/video/` exists;
 * 3. `global` — Phase 44's global root setting.
 * `null` source means none resolved, and the tab offers Setup Video.
 */
export const VIDEO_ROOT_SOURCES = ['repo', 'repo-media', 'global'] as const;
export const VideoRootSourceSchema = z.enum(VIDEO_ROOT_SOURCES);
export type VideoRootSource = z.infer<typeof VideoRootSourceSchema>;

export const VideoRootResolutionSchema = z.object({
  root: z.string().nullable(),
  source: VideoRootSourceSchema.nullable(),
  /** `<repo>/.midnite/media/video` for the active repo — where Setup Video scaffolds. `null` with no repo. */
  setupTarget: z.string().nullable(),
});
export type VideoRootResolution = z.infer<typeof VideoRootResolutionSchema>;

/** `.midnite/media/video` — the repo-local video root Setup Video writes. */
export const VIDEO_REPO_MEDIA_DIR = '.midnite/media/video';

/** The two directories that mark a folder as a midnite-videos workspace. */
export const VIDEO_LAYOUT_MARKERS = ['video-editor', 'projects'] as const;

/** Remotion `--codec` values the render dialog offers. */
export const VIDEO_RENDER_CODECS = ['h264', 'vp8', 'vp9', 'prores', 'gif'] as const;
export const VideoRenderCodecSchema = z.enum(VIDEO_RENDER_CODECS);
export type VideoRenderCodec = z.infer<typeof VideoRenderCodecSchema>;

export const VIDEO_CODEC_INFO: Record<VideoRenderCodec, { label: string; ext: string; crf: boolean }> = {
  h264: { label: 'H.264 (mp4)', ext: 'mp4', crf: true },
  vp8: { label: 'VP8 (webm)', ext: 'webm', crf: true },
  vp9: { label: 'VP9 (webm)', ext: 'webm', crf: true },
  prores: { label: 'ProRes (mov)', ext: 'mov', crf: false },
  gif: { label: 'GIF', ext: 'gif', crf: false },
};

/** Render-dialog knobs. Every field optional; omitted means Remotion's own default. */
export const VideoRenderOptionsSchema = z.object({
  codec: VideoRenderCodecSchema.default('h264'),
  /** Constant rate factor — lower is better. Ignored by prores/gif. */
  crf: z.number().int().min(0).max(63).optional(),
  /** Resolution scale, e.g. 0.5 for half size. */
  scale: z.number().positive().max(4).optional(),
  /** Iteration label — `vN-<label>`; letters, digits, dot, dash, underscore. */
  label: z
    .string()
    .regex(/^[\w.-]+$/, 'letters, digits, dot, dash and underscore only')
    .max(60)
    .optional(),
});
export type VideoRenderOptions = z.infer<typeof VideoRenderOptionsSchema>;

/** Extensions an iteration may carry — one per codec. */
const ITERATION_PATTERN = /^v(\d+)(?:-([\w.-]+?))?\.(mp4|webm|mov|gif)$/;

/**
 * One rendered iteration under `<project>/output/`. `sharesVersion` marks a
 * pinned version (`render.mjs --version v3`) that several variants share, so
 * the tree can show them as siblings rather than successive cuts.
 */
export type VideoIteration = {
  filename: string;
  version: number;
  label: string | null;
  ext: string;
  sharesVersion: boolean;
};

/**
 * Parse `output/` filenames into iterations, **newest first**: descending
 * version, then label (unlabelled before labelled) within a version. Anything
 * that is not `vN[-label].<ext>` — `CHANGELOG.md`, `_stills/` — is skipped.
 */
export function parseIterations(filenames: readonly string[]): VideoIteration[] {
  const parsed: VideoIteration[] = [];
  for (const filename of filenames) {
    const match = ITERATION_PATTERN.exec(filename);
    if (!match) continue;
    parsed.push({
      filename,
      version: Number(match[1]),
      label: match[2] ?? null,
      ext: match[3]!,
      sharesVersion: false,
    });
  }
  const counts = new Map<number, number>();
  for (const it of parsed) counts.set(it.version, (counts.get(it.version) ?? 0) + 1);
  for (const it of parsed) it.sharesVersion = (counts.get(it.version) ?? 0) > 1;
  return parsed.sort(
    (a, b) =>
      b.version - a.version ||
      (a.label === null ? -1 : b.label === null ? 1 : a.label.localeCompare(b.label)),
  );
}

/** `v3-high.mp4` → `v3-high`: the heading `render.mjs` writes into `CHANGELOG.md`. */
export function iterationStem(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

/**
 * The `## <stem> — <date>` section of an `output/CHANGELOG.md` for one
 * iteration, body included, or `null` when the changelog has no entry for it.
 */
export function changelogEntry(changelog: string, filename: string): string | null {
  const stem = iterationStem(filename);
  const lines = changelog.split('\n');
  const start = lines.findIndex((line) => {
    const heading = /^##\s+(\S+)/.exec(line);
    return heading?.[1] === stem;
  });
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i]!)) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n').trim();
}

/** Remotion Studio deep-links a composition at `/<compositionId>`. */
export function studioCompositionUrl(studioUrl: string, compositionId: string | null): string {
  if (!compositionId) return studioUrl;
  return `${studioUrl.replace(/\/+$/, '')}/${encodeURIComponent(compositionId)}`;
}
