/**
 * Media page (Phase 99) — the wire contract for the four-tab Media view.
 *
 * Theme A owns this file's shell half: the tab enum, the export-format table,
 * the repo-scoped media-store shapes and the ffmpeg export events. Themes B–E
 * extend it (provider catalogues, sidecar schemas) rather than starting a
 * second file, so every Media id a renderer or main module can name lives in
 * one place.
 *
 * Storage is per repo: `<repo>/.midnite/media/<tab>/<project>/<file>`, plain
 * files that git and Finder both see. Nothing here writes a `.gitignore`.
 */
import { z } from 'zod';

import type { SecretKey } from './domain/secrets';

// --- tabs --------------------------------------------------------------------

/** Tab order is render order in the strip. `doc` is first by decision. */
export const MEDIA_TABS = ['doc', 'image', 'video', 'audio'] as const;
export const MediaTabSchema = z.enum(MEDIA_TABS);
export type MediaTab = z.infer<typeof MediaTabSchema>;

/**
 * The tabs whose storage lives under `.midnite/media/<tab>/` and therefore
 * need an open repo. Video resolves its own root (Theme D), falling back to
 * Phase 44's global setting, so it keeps working with no repo open.
 */
export const REPO_SCOPED_MEDIA_TABS: readonly MediaTab[] = ['doc', 'image', 'audio'];

/** `<repo>/.midnite/media` — joined with the tab id for each tab's root. */
export const MEDIA_ROOT_DIR = '.midnite/media';

// --- export formats ----------------------------------------------------------

export const MEDIA_EXPORT_FORMATS = [
  // doc — rendered by Theme B without ffmpeg
  'md',
  'html',
  'pdf',
  // image
  'png',
  'jpeg',
  'webp',
  // video
  'mp4',
  'webm',
  'gif',
  'prores',
  // audio
  'mp3',
  'wav',
  'flac',
] as const;
export const MediaExportFormatSchema = z.enum(MEDIA_EXPORT_FORMATS);
export type MediaExportFormat = z.infer<typeof MediaExportFormatSchema>;

export type MediaExportFormatInfo = {
  label: string;
  /** File extension the save dialog proposes, without the dot. */
  ext: string;
  /** True when `export-service.ts` transcodes it through ffmpeg. */
  needsFfmpeg: boolean;
};

export const MEDIA_EXPORT_FORMAT_INFO: Record<MediaExportFormat, MediaExportFormatInfo> = {
  md: { label: 'Markdown', ext: 'md', needsFfmpeg: false },
  html: { label: 'HTML', ext: 'html', needsFfmpeg: false },
  pdf: { label: 'PDF', ext: 'pdf', needsFfmpeg: false },
  png: { label: 'PNG', ext: 'png', needsFfmpeg: true },
  jpeg: { label: 'JPEG', ext: 'jpg', needsFfmpeg: true },
  webp: { label: 'WebP', ext: 'webp', needsFfmpeg: true },
  mp4: { label: 'MP4 (H.264)', ext: 'mp4', needsFfmpeg: true },
  webm: { label: 'WebM (VP9)', ext: 'webm', needsFfmpeg: true },
  gif: { label: 'GIF', ext: 'gif', needsFfmpeg: true },
  prores: { label: 'ProRes', ext: 'mov', needsFfmpeg: true },
  mp3: { label: 'MP3', ext: 'mp3', needsFfmpeg: true },
  wav: { label: 'WAV', ext: 'wav', needsFfmpeg: true },
  flac: { label: 'FLAC', ext: 'flac', needsFfmpeg: true },
};

/** Each tab's export menu, first entry = the split button's default. */
export const MEDIA_TAB_EXPORT_FORMATS: Record<MediaTab, readonly MediaExportFormat[]> = {
  doc: ['md', 'html', 'pdf'],
  image: ['png', 'jpeg', 'webp'],
  video: ['mp4', 'webm', 'gif', 'prores'],
  audio: ['mp3', 'wav', 'flac'],
};

/** Every ffmpeg-backed format — the domain of `export-service.ts`'s preset table. */
export const FFMPEG_EXPORT_FORMATS = MEDIA_EXPORT_FORMATS.filter(
  (format) => MEDIA_EXPORT_FORMAT_INFO[format].needsFfmpeg,
);

// --- media store -------------------------------------------------------------

/**
 * A project folder name — one path segment, no dot-leading names (so `.`,
 * `..` and hidden folders never become a project). Main re-confines anyway;
 * this is the cheap first filter.
 */
export const MediaProjectNameSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[^/\\\0]+$/, 'must be one path segment')
  .refine((name) => !name.startsWith('.'), 'must not start with a dot');

/** A file path relative to a project folder; may contain `/` for nested files. */
export const MediaRelPathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((p) => !p.includes('\0'), 'must not contain NUL')
  .refine((p) => !p.startsWith('/'), 'must be relative')
  .refine((p) => !p.split('/').some((seg) => seg === '..' || seg === ''), 'must not traverse');

export const MediaProjectSchema = z.object({
  name: MediaProjectNameSchema,
  /** Files under the project, recursive — what the delete confirm names. */
  fileCount: z.number().int().nonnegative(),
  mtimeMs: z.number().nonnegative(),
});
export type MediaProject = z.infer<typeof MediaProjectSchema>;

export const MediaFileEntrySchema = z.object({
  /** Relative to the project folder, `/`-separated. */
  path: z.string().min(1),
  size: z.number().int().nonnegative(),
  mtimeMs: z.number().nonnegative(),
});
export type MediaFileEntry = z.infer<typeof MediaFileEntrySchema>;

/**
 * The size past which `file-write` reports `largeFile: true`, so the renderer
 * can show the one-time "consider `git lfs track`" hint. Nothing is blocked
 * and LFS is never configured automatically.
 */
export const MEDIA_LARGE_FILE_BYTES = 25 * 1024 * 1024;

/** Pushed on `mstudio:media:changed` — a debounced ping, the renderer re-fetches. */
export const MediaChangedEventSchema = z.object({
  repoId: z.string().min(1),
  tab: MediaTabSchema,
});
export type MediaChangedEvent = z.infer<typeof MediaChangedEventSchema>;

// --- images (Theme C) --------------------------------------------------------

/**
 * Image-generation providers, in picker order. Generation runs in main
 * (`main/media/image/`); the renderer only ever names a provider and model.
 *
 * `agy` is listed but disabled: this phase's headless spike could not show
 * Antigravity CLI writing an image non-interactively (see the phase doc's
 * Headlines), so Gemini is the default and agy carries the reason.
 */
export const IMAGE_PROVIDER_IDS = ['gemini', 'openai', 'agy', 'ollama'] as const;
export const ImageProviderIdSchema = z.enum(IMAGE_PROVIDER_IDS);
export type ImageProviderId = z.infer<typeof ImageProviderIdSchema>;

export const DEFAULT_IMAGE_PROVIDER: ImageProviderId = 'gemini';

/** Aspect ratios offered by the create panel; each adapter maps them to its own size vocabulary. */
export const IMAGE_ASPECTS = ['1:1', '3:2', '2:3', '16:9', '9:16'] as const;
export const ImageAspectSchema = z.enum(IMAGE_ASPECTS);
export type ImageAspect = z.infer<typeof ImageAspectSchema>;

/** Images per Generate. Every adapter can do four in one request or four sequential ones. */
export const IMAGE_MAX_COUNT = 4;

export type ImageModelInfo = { id: string; label: string };

export type ImageProviderInfo = {
  id: ImageProviderId;
  label: string;
  /** The vault key this provider needs, or `null` when it needs none. */
  secretKey: SecretKey | null;
  /** Static catalogue. Empty for `ollama`, whose image models are discovered from the daemon. */
  models: readonly ImageModelInfo[];
  /** Set when the provider can never be picked in this build — shown as the option's tooltip. */
  disabledReason?: string;
};

export const AGY_IMAGE_DISABLED_REASON =
  'Antigravity CLI has no headless image output yet — its print mode returns text only. Use Gemini, which is the same model family.';

export const IMAGE_PROVIDERS: readonly ImageProviderInfo[] = [
  {
    id: 'gemini',
    label: 'Gemini',
    secretKey: 'media.geminiApiKey',
    models: [
      { id: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image' },
      { id: 'imagen-4.0-generate-001', label: 'Imagen 4' },
      { id: 'imagen-4.0-fast-generate-001', label: 'Imagen 4 Fast' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    secretKey: 'media.openaiApiKey',
    models: [
      { id: 'gpt-image-1', label: 'GPT Image 1' },
      { id: 'gpt-image-1-mini', label: 'GPT Image 1 Mini' },
    ],
  },
  {
    id: 'agy',
    label: 'Antigravity CLI',
    secretKey: null,
    models: [{ id: 'agy-default', label: 'Default' }],
    disabledReason: AGY_IMAGE_DISABLED_REASON,
  },
  { id: 'ollama', label: 'Ollama', secretKey: null, models: [] },
];

export function imageProviderInfo(id: ImageProviderId): ImageProviderInfo {
  return IMAGE_PROVIDERS.find((p) => p.id === id)!;
}

/**
 * The models a provider offers: its static catalogue, or — for a provider
 * whose catalogue is discovered (Ollama) — whatever main reported.
 */
export function imageModelsFor(
  id: ImageProviderId,
  discovered: readonly ImageModelInfo[] = [],
): readonly ImageModelInfo[] {
  const info = imageProviderInfo(id);
  return info.models.length > 0 ? info.models : discovered;
}

/** What main reports per provider: whether it can run now, why not, and discovered models. */
export const ImageProviderStatusSchema = z.object({
  id: ImageProviderIdSchema,
  available: z.boolean(),
  reason: z.string().optional(),
  /** `missing-key` lets the create panel offer "Add key" instead of a bare reason. */
  missingKey: z.boolean().default(false),
  models: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).default([]),
});
export type ImageProviderStatus = z.infer<typeof ImageProviderStatusSchema>;

/** Extensions the Images tab treats as images. */
export const IMAGE_FILE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'] as const;

export function isImagePath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return (IMAGE_FILE_EXTENSIONS as readonly string[]).includes(ext);
}

/** `a/b/cat.png` → `a/b/cat.json`: the sidecar that sits beside every generated image. */
export function imageSidecarPath(imagePath: string): string {
  return imagePath.replace(/\.[^./]+$/, '') + '.json';
}

/** Written beside each generated image as `<name>.json`. */
export const ImageSidecarSchema = z.object({
  version: z.literal(1),
  /** The image's file name within the project. */
  file: z.string().min(1),
  prompt: z.string(),
  provider: ImageProviderIdSchema,
  model: z.string().min(1),
  aspect: ImageAspectSchema,
  seed: z.number().int().optional(),
  /** ISO-8601. */
  createdAt: z.string().min(1),
});
export type ImageSidecar = z.infer<typeof ImageSidecarSchema>;

/** `null` when the text is not a valid sidecar — a hand-edited or foreign `.json` is just not shown. */
export function parseImageSidecar(text: string): ImageSidecar | null {
  try {
    const parsed = ImageSidecarSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const IMAGE_PROMPT_MAX = 4000;

export const ImageGenerateRequestSchema = z.object({
  /** Minted by the renderer so it can cancel before the invoke resolves. */
  generationId: z.string().min(1),
  repoId: z.string().min(1),
  project: MediaProjectNameSchema,
  prompt: z.string().trim().min(1).max(IMAGE_PROMPT_MAX),
  provider: ImageProviderIdSchema,
  model: z.string().min(1),
  aspect: ImageAspectSchema.default('1:1'),
  count: z.number().int().min(1).max(IMAGE_MAX_COUNT).default(1),
  seed: z.number().int().nonnegative().optional(),
});
export type ImageGenerateRequest = z.infer<typeof ImageGenerateRequestSchema>;

export const IMAGE_GENERATE_STATUSES = ['running', 'succeeded', 'failed', 'cancelled'] as const;

/** Pushed on `mstudio:media:image-progress`; `files` grows as each image lands. */
export const ImageGenerateProgressEventSchema = z.object({
  generationId: z.string().min(1),
  repoId: z.string().min(1),
  project: MediaProjectNameSchema,
  status: z.enum(IMAGE_GENERATE_STATUSES),
  completed: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  files: z.array(z.string()),
  error: z.string().optional(),
});
export type ImageGenerateProgressEvent = z.infer<typeof ImageGenerateProgressEventSchema>;

// --- export service ----------------------------------------------------------

/**
 * What to export. `media` is a file in a repo's media store; Theme D adds a
 * `video` arm for iterations under the resolved video root rather than
 * widening this one to an arbitrary path.
 */
export const MediaExportSourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('media'),
    repoId: z.string().min(1),
    tab: MediaTabSchema,
    project: MediaProjectNameSchema,
    path: MediaRelPathSchema,
  }),
  /**
   * Theme D — a rendered iteration under the resolved video root's
   * `projects/<projectId>/output/`. Main re-resolves and re-confines it
   * against that root; the renderer never names an absolute path.
   */
  z.object({
    kind: z.literal('video'),
    projectId: z.string().min(1),
    name: z
      .string()
      .min(1)
      .regex(/^[^/\\\0]+$/, 'must be one path segment'),
  }),
]);
export type MediaExportSource = z.infer<typeof MediaExportSourceSchema>;

/** Per-format knobs; every field optional, the preset table owns the defaults. */
export const MediaExportOptionsSchema = z.object({
  /** jpeg/webp quality 1–100. */
  quality: z.number().int().min(1).max(100).optional(),
  /** mp3 bitrate in kbps. */
  bitrateKbps: z.number().int().min(32).max(320).optional(),
  /** Video resolution scale, e.g. 0.5. */
  scale: z.number().positive().max(4).optional(),
});
export type MediaExportOptions = z.infer<typeof MediaExportOptionsSchema>;

export const MEDIA_EXPORT_STATUSES = ['running', 'succeeded', 'failed', 'cancelled'] as const;
export const MediaExportStatusSchema = z.enum(MEDIA_EXPORT_STATUSES);
export type MediaExportStatus = z.infer<typeof MediaExportStatusSchema>;

/** Pushed on `mstudio:media:export-progress`. `progress` is absent until ffmpeg reports a duration. */
export const MediaExportProgressEventSchema = z.object({
  exportId: z.string().min(1),
  status: MediaExportStatusSchema,
  progress: z.number().min(0).max(1).optional(),
  error: z.string().optional(),
});
export type MediaExportProgressEvent = z.infer<typeof MediaExportProgressEventSchema>;

/** `found: false` disables every ffmpeg-backed export, with `reason` as the hint. */
export const FfmpegStatusSchema = z.discriminatedUnion('found', [
  z.object({ found: z.literal(true), path: z.string().min(1), version: z.string().nullable() }),
  z.object({ found: z.literal(false), reason: z.string() }),
]);
export type FfmpegStatus = z.infer<typeof FfmpegStatusSchema>;

/** Typed into a visible terminal by the Install action — never run headless. */
export const FFMPEG_INSTALL_COMMAND = 'brew install ffmpeg';
