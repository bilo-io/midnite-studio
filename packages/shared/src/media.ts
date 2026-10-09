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
export const MEDIA_TABS = ['doc', 'image', 'video', 'audio', 'map', 'terrain', 'model', 'sprite', 'game'] as const;
export const MediaTabSchema = z.enum(MEDIA_TABS);
export type MediaTab = z.infer<typeof MediaTabSchema>;

/**
 * The tabs whose storage lives under `.midnite/media/<tab>/` and therefore
 * need an open repo. Video resolves its own root (Theme D), falling back to
 * Phase 44's global setting, so it keeps working with no repo open; Games (Phase 107) likewise resolves its
 * own root (the games location setting).
 */
export const REPO_SCOPED_MEDIA_TABS: readonly MediaTab[] = ['doc', 'image', 'audio', 'map', 'terrain', 'model', 'sprite'];

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
  // music editor (Phase 101 Theme J) — the song's own interchange file, encoded by main
  'mid',
  // model (3D) — written by main's own exporters, no ffmpeg
  'obj',
  'fbx',
  'fbx-ascii',
  'glb',
  // game (Phase 107) — written by main's own exporters, no ffmpeg
  'game-html',
  'game-zip',
  'game-folder',
  // sprites (Phase 106) — a pack is a folder of PNG atlas + JSON, written by main
  'sprite-pack',
  'terrain-pack',
  // maps (Phase 108) — the selected GeoJSON layer, written by Theme H
  'geojson',
  'kml',
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
  mid: { label: 'MIDI', ext: 'mid', needsFfmpeg: false },
  wav: { label: 'WAV', ext: 'wav', needsFfmpeg: true },
  flac: { label: 'FLAC', ext: 'flac', needsFfmpeg: true },
  obj: { label: 'Wavefront OBJ', ext: 'obj', needsFfmpeg: false },
  fbx: { label: 'Autodesk FBX (binary)', ext: 'fbx', needsFfmpeg: false },
  'fbx-ascii': { label: 'Autodesk FBX (ASCII)', ext: 'fbx', needsFfmpeg: false },
  glb: { label: 'glTF binary (PBR)', ext: 'glb', needsFfmpeg: false },
  'terrain-pack': { label: 'Terrain pack (folder)', ext: '', needsFfmpeg: false },
  'game-html': { label: 'Single HTML file', ext: 'html', needsFfmpeg: false },
  'game-zip': { label: 'Zip archive', ext: 'zip', needsFfmpeg: false },
  'game-folder': { label: 'Static folder', ext: '', needsFfmpeg: false },
  'sprite-pack': { label: 'Sprite pack (folder)', ext: '', needsFfmpeg: false },
  geojson: { label: 'GeoJSON layer', ext: 'geojson', needsFfmpeg: false },
  kml: { label: 'KML layer', ext: 'kml', needsFfmpeg: false },
};

/** Each tab's export menu, first entry = the split button's default. */
export const MEDIA_TAB_EXPORT_FORMATS: Record<MediaTab, readonly MediaExportFormat[]> = {
  doc: ['md', 'html', 'pdf'],
  image: ['png', 'jpeg', 'webp'],
  video: ['mp4', 'webm', 'gif', 'prores'],
  audio: ['mp3', 'wav', 'flac'],
  model: ['obj', 'fbx', 'glb', 'fbx-ascii'],
  // The pack (a folder, not a zip: Phase 105 Decision 13) is the default; the glb is one file for a DCC tool.
  terrain: ['terrain-pack', 'glb'],
  // Theme G (Phase 106) writes the pack; until then the tab's export answers "not available yet".
  sprite: ['sprite-pack'],
  game: ['game-html', 'game-zip', 'game-folder'],
  // Phase 108: the split button exports the selected layer (Theme H).
  map: ['geojson', 'kml'],
};

/** The Audio ▸ Editor's menu (Phase 101 Theme J): the .mid, the offline WAV render, and its MP3. */
export const MEDIA_AUDIO_EDITOR_EXPORT_FORMATS: readonly MediaExportFormat[] = ['mid', 'wav', 'mp3'];

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
 * `agy` (Antigravity CLI) needs no API key: it is a provider in its own right
 * and also the fallback main routes Gemini/OpenAI requests through when no key
 * is set (API keys are optional).
 */
export const IMAGE_PROVIDER_IDS = ['gemini', 'openai', 'agy', 'ollama'] as const;
export const ImageProviderIdSchema = z.enum(IMAGE_PROVIDER_IDS);
export type ImageProviderId = z.infer<typeof ImageProviderIdSchema>;

export const DEFAULT_IMAGE_PROVIDER: ImageProviderId = 'agy';

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
  /**
   * Whether the adapter can attach reference images (Phase 106 Theme D, Decision 5): Gemini sends them
   * as `inline_data` parts (`gemini-*-image` models only), OpenAI switches to `/v1/images/edits`.
   */
  supportsReference: boolean;
};

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
    supportsReference: true,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    secretKey: 'media.openaiApiKey',
    models: [
      { id: 'gpt-image-1', label: 'GPT Image 1' },
      { id: 'gpt-image-1-mini', label: 'GPT Image 1 Mini' },
    ],
    supportsReference: true,
  },
  {
    id: 'agy',
    label: 'Antigravity CLI',
    secretKey: null,
    models: [{ id: 'agy-default', label: 'Gemini 2.5 Flash Image' }],
    supportsReference: false,
  },
  { id: 'ollama', label: 'Ollama', secretKey: null, models: [], supportsReference: false },
];

/** At most this many reference images ride along with one request. */
export const IMAGE_MAX_REFERENCES = 4;

/** Gemini's Imagen models answer `:predict`, which takes no reference image. */
export function imageModelSupportsReference(provider: ImageProviderId, model: string): boolean {
  if (!imageProviderInfo(provider).supportsReference) return false;
  return !(provider === 'gemini' && model.startsWith('imagen-'));
}

/** Why a provider cannot draw reference-locked frames — the picker's tooltip and the job's refusal. */
export const imageReferenceUnsupportedReason = (label: string): string =>
  `${label} can't use a reference image, so frames would not match. Pick Gemini or OpenAI.`;

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
  /**
   * Reference images (Phase 106 Theme D): paths inside the same repo's `.midnite/media/`
   * (`<tab>/<project>/<path>`), confined by the media store. Only providers with `supportsReference`.
   */
  references: z.array(z.string().min(1).max(1024)).max(IMAGE_MAX_REFERENCES).optional(),
  /** Ask for a real transparent background where the provider can return one (OpenAI). */
  transparent: z.boolean().optional(),
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

// --- audio (Theme E) ---------------------------------------------------------

/**
 * Audio providers, in picker order. `musicgen` is the local engine (Meta's
 * MusicGen-small, run in-process through ONNX — no API key, no Python, no
 * server); `import` copies files the user picks in as variants. A heavier
 * engine (ACE-Step behind a local server, say) joins here and in main —
 * nothing else moves.
 */
export const AUDIO_PROVIDER_IDS = ['musicgen', 'import'] as const;
export const AudioProviderIdSchema = z.enum(AUDIO_PROVIDER_IDS);
export type AudioProviderId = z.infer<typeof AudioProviderIdSchema>;

export const DEFAULT_AUDIO_PROVIDER: AudioProviderId = 'musicgen';

export type AudioProviderInfo = {
  id: AudioProviderId;
  label: string;
  /** False for `import` — Create is not offered for it, only the attach action. */
  generates: boolean;
};

export const AUDIO_PROVIDERS: readonly AudioProviderInfo[] = [
  { id: 'musicgen', label: 'MusicGen (local)', generates: true },
  { id: 'import', label: 'Import', generates: false },
];

export function audioProviderInfo(id: AudioProviderId): AudioProviderInfo {
  return AUDIO_PROVIDERS.find((p) => p.id === id)!;
}

export const AUDIO_GENERATION_UNAVAILABLE = 'Pick a generating provider to create music, or import audio to add variants.';

/**
 * The local engine's honest limits. MusicGen-small is a ~300M-parameter
 * instrumental model trained on 30 s clips: no vocals, no lyrics, and anything
 * longer is rendered as stitched 30 s sections. Weights are CC-BY-NC-4.0.
 */
export const AUDIO_LOCAL_SEGMENT_S = 30;
export const AUDIO_LOCAL_MAX_DURATION_S = 120;
export const AUDIO_LOCAL_MODEL_ID = 'Xenova/musicgen-small';
/** Approximate one-time download (q8 text encoder + q8 decoder + fp32 EnCodec). */
export const AUDIO_LOCAL_MODEL_BYTES = 660_000_000;
export const AUDIO_LOCAL_MODEL_LICENSE = 'CC-BY-NC-4.0';

/**
 * Optional prompt expansion through a local Ollama model. Ollama cannot make
 * audio, but a small instruction model turns "lofi study beat" into the
 * descriptive caption MusicGen was trained on. 3B-class models fit an 8 GB
 * Mac (~2-3 GB resident) and run before the audio model loads, never beside it.
 */
export const AUDIO_OLLAMA_RECOMMENDED = 'llama3.2:3b';
/** Tried in order when no model is chosen; the first one installed wins. */
export const AUDIO_OLLAMA_PREFERRED = ['llama3.2:3b', 'qwen3:4b', 'gemma3:4b', 'qwen3:1.7b', 'llama3.2:1b'] as const;

/** Extensions the Audio tab treats as playable variants (and the import dialog's filter). */
export const AUDIO_FILE_EXTENSIONS = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'] as const;

export function isAudioPath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return path.includes('.') && (AUDIO_FILE_EXTENSIONS as readonly string[]).includes(ext);
}

/** `a/song.mp3` → `a/song.json`, the sidecar beside every variant. */
export const audioSidecarPath = (audioPath: string): string => audioPath.replace(/\.[^./]+$/, '') + '.json';

/** The project's session history, at `.midnite/media/audio/<project>/project.json`. */
export const AUDIO_PROJECT_FILE = 'project.json';

export const AUDIO_TITLE_MAX = 120;
export const AUDIO_STYLE_TAG_MAX = 40;
export const AUDIO_STYLE_TAGS_MAX = 12;
export const AUDIO_LYRICS_MAX = 5000;
export const AUDIO_DURATION_MIN_S = 10;
export const AUDIO_DURATION_MAX_S = 480;
export const AUDIO_MAX_VARIANTS = 4;
export const AUDIO_MUSIC_PROMPT_MAX = 400;
export const AUDIO_SECTIONS_MAX = 8;
/** Section markers the lyrics editor's helpers insert. */
export const AUDIO_LYRIC_SECTIONS = ['Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Outro'] as const;

/** The Suno-style prompt form — what a create (or an import's metadata) records. */
export const AudioPromptSchema = z.object({
  title: z.string().trim().max(AUDIO_TITLE_MAX).default(''),
  style: z
    .array(z.string().trim().min(1).max(AUDIO_STYLE_TAG_MAX))
    .max(AUDIO_STYLE_TAGS_MAX)
    .default([]),
  lyrics: z.string().max(AUDIO_LYRICS_MAX).default(''),
  instrumental: z.boolean().default(false),
  durationS: z.number().int().min(AUDIO_DURATION_MIN_S).max(AUDIO_DURATION_MAX_S).default(120),
  count: z.number().int().min(1).max(AUDIO_MAX_VARIANTS).default(2),
  /** A hand-written or Ollama-expanded caption sent to the engine in place of one built from `style`. */
  musicPrompt: z.string().trim().max(AUDIO_MUSIC_PROMPT_MAX).optional(),
  /** Per-section captions for tracks longer than one segment; sections cycle through them. */
  sections: z.array(z.string().trim().min(1).max(AUDIO_MUSIC_PROMPT_MAX)).max(AUDIO_SECTIONS_MAX).optional(),
});
export type AudioPrompt = z.infer<typeof AudioPromptSchema>;

/** Written beside each variant as `<name>.json`. `peaks` is filled lazily by the renderer. */
export const AudioSidecarSchema = z.object({
  version: z.literal(1),
  file: z.string().min(1),
  sessionId: z.string().min(1),
  provider: AudioProviderIdSchema,
  title: z.string(),
  /** Import only: the picked file's own name. */
  source: z.string().optional(),
  durationS: z.number().nonnegative().optional(),
  /** Normalised 0..1 per-bucket peaks, computed once with Web Audio. */
  peaks: z.array(z.number().min(0).max(1)).max(1024).optional(),
  createdAt: z.string().min(1),
  /** Theme K: the editor song this clip was rendered from, so the variant links back to it. */
  fromSong: z.object({ project: MediaProjectNameSchema, name: z.string().min(1) }).optional(),
  /** Theme K: the deterministic description derived from that song (MusicGen-melody has no ONNX build). */
  description: z.string().optional(),
});
export type AudioSidecar = z.infer<typeof AudioSidecarSchema>;

export function parseAudioSidecar(text: string): AudioSidecar | null {
  try {
    const parsed = AudioSidecarSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const AudioSessionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['create', 'import']),
  provider: AudioProviderIdSchema,
  prompt: AudioPromptSchema,
  /** Variant file names within the project, in landing order. */
  variants: z.array(z.string().min(1)),
  createdAt: z.string().min(1),
});
export type AudioSession = z.infer<typeof AudioSessionSchema>;

export const AudioProjectFileSchema = z.object({
  version: z.literal(1),
  sessions: z.array(AudioSessionSchema),
});
export type AudioProjectFile = z.infer<typeof AudioProjectFileSchema>;

/** A missing, hand-broken or foreign `project.json` reads as an empty history — never a crash. */
export function parseAudioProjectFile(text: string | null | undefined): AudioProjectFile {
  if (!text) return { version: 1, sessions: [] };
  try {
    const parsed = AudioProjectFileSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : { version: 1, sessions: [] };
  } catch {
    return { version: 1, sessions: [] };
  }
}

export const AudioProviderStatusSchema = z.object({
  id: AudioProviderIdSchema,
  available: z.boolean(),
  generates: z.boolean(),
  reason: z.string().optional(),
});
export type AudioProviderStatus = z.infer<typeof AudioProviderStatusSchema>;

/**
 * Import: main opens a native multi-select dialog, the `import` adapter copies
 * each pick into the project, and the service writes a sidecar per variant and
 * appends one session to `project.json`. A dismissed dialog answers `cancelled`.
 */
export const AudioImportRequestSchema = z.object({
  importId: z.string().min(1),
  repoId: z.string().min(1),
  project: MediaProjectNameSchema,
  prompt: AudioPromptSchema,
});
export type AudioImportRequest = z.infer<typeof AudioImportRequestSchema>;

/** Pushed on `mstudio:media:audio-progress`; `files` grows as each variant lands. */
export const AudioProgressEventSchema = z.object({
  importId: z.string().min(1),
  repoId: z.string().min(1),
  project: MediaProjectNameSchema,
  status: z.enum(['running', 'succeeded', 'failed', 'cancelled']),
  completed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  files: z.array(z.string()),
  error: z.string().optional(),
  /** What a generating provider is doing right now ("Rendering section 2 of 4"). */
  stage: z.string().optional(),
  /** Overall 0..1 progress of the whole run, when the provider can tell. */
  fraction: z.number().min(0).max(1).optional(),
});
export type AudioProgressEvent = z.infer<typeof AudioProgressEventSchema>;

/** mp3 bitrates offered by the Audio toolbar. */
export const AUDIO_MP3_BITRATES = [128, 192, 256, 320] as const;

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

// --- docs (Theme B) ----------------------------------------------------------

/** A Docs file is a plain markdown file; its AI thread sits beside it. */
export const DOC_FILE_EXT = '.md';

/** The formats Docs renders itself, without ffmpeg. */
export const DOC_EXPORT_FORMATS = ['md', 'html', 'pdf'] as const;
export const DocExportFormatSchema = z.enum(DOC_EXPORT_FORMATS);
export type DocExportFormat = z.infer<typeof DocExportFormatSchema>;

export function isDocFile(path: string): boolean {
  return path.toLowerCase().endsWith(DOC_FILE_EXT);
}

/** `notes/intro.md` → `notes/intro.thread.json` — the doc's own chat sidecar. */
export function docThreadPath(docPath: string): string {
  return `${docPath.replace(/\.md$/i, '')}.thread.json`;
}

/** Whether a Docs edit rewrote the selection or the whole document. */
export const DocEditScopeSchema = z.enum(['selection', 'doc']);
export type DocEditScope = z.infer<typeof DocEditScopeSchema>;

/**
 * An AI edit waiting on the user. `original` is the exact markdown it
 * replaces — the selection, or the whole doc — so Accept can find it again
 * in whatever the doc holds by then. Nothing is written until Accept.
 */
export const DocProposalSchema = z.object({
  scope: DocEditScopeSchema,
  original: z.string(),
  replacement: z.string(),
  status: z.enum(['pending', 'accepted', 'rejected']),
});
export type DocProposal = z.infer<typeof DocProposalSchema>;

export const DocThreadMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  createdAt: z.number().nonnegative(),
  /** Assistant turns that produced an edit. */
  proposal: DocProposalSchema.optional(),
  /** Assistant turns that failed — the envelope's message. */
  error: z.string().optional(),
});
export type DocThreadMessage = z.infer<typeof DocThreadMessageSchema>;

/** `<doc>.thread.json` — versioned so a later shape can migrate. */
export const DocThreadSchema = z.object({
  version: z.literal(1),
  messages: z.array(DocThreadMessageSchema),
});
export type DocThread = z.infer<typeof DocThreadSchema>;

// --- audio: local engine, Ollama assist --------------------------------------

/** Generate: same envelope as Import, minus the dialog. Resolves once every variant has landed. */
export const AudioGenerateRequestSchema = AudioImportRequestSchema.extend({
  provider: AudioProviderIdSchema.default(DEFAULT_AUDIO_PROVIDER),
});
export type AudioGenerateRequest = z.infer<typeof AudioGenerateRequestSchema>;

export const AudioEngineStateSchema = z.enum(['missing', 'downloading', 'ready', 'unavailable']);
export type AudioEngineState = z.infer<typeof AudioEngineStateSchema>;

/** Whether the local engine and Ollama are usable right now. Never throws; a down daemon is `running: false`. */
export const AudioEngineStatusSchema = z.object({
  musicgen: z.object({
    state: AudioEngineStateSchema,
    /** Approximate download still ahead of a first run. */
    downloadBytes: z.number().nonnegative(),
    reason: z.string().optional(),
  }),
  ollama: z.object({
    running: z.boolean(),
    models: z.array(z.string()),
    /** The model Enhance would use: the user's pick, else the first preferred one installed. */
    model: z.string().nullable(),
    recommended: z.string(),
  }),
});
export type AudioEngineStatus = z.infer<typeof AudioEngineStatusSchema>;

/** Pushed on `mstudio:media:audio-engine-progress` while the model downloads or loads. */
export const AudioEngineProgressSchema = z.object({
  phase: z.enum(['download', 'load', 'ready', 'failed']),
  fraction: z.number().min(0).max(1),
  message: z.string().optional(),
});
export type AudioEngineProgress = z.infer<typeof AudioEngineProgressSchema>;

/** Enhance: turn the form into a MusicGen caption (and per-section captions) with a local Ollama model. */
export const AudioExpandRequestSchema = z.object({
  title: z.string().max(AUDIO_TITLE_MAX).default(''),
  style: z.array(z.string().max(AUDIO_STYLE_TAG_MAX)).max(AUDIO_STYLE_TAGS_MAX).default([]),
  lyrics: z.string().max(AUDIO_LYRICS_MAX).default(''),
  instrumental: z.boolean().default(false),
  durationS: z.number().int().min(AUDIO_DURATION_MIN_S).max(AUDIO_DURATION_MAX_S).default(120),
  /** Empty picks automatically. */
  model: z.string().max(120).default(''),
});
export type AudioExpandRequest = z.infer<typeof AudioExpandRequestSchema>;

export const AudioExpandResultSchema = z.object({
  musicPrompt: z.string().min(1).max(AUDIO_MUSIC_PROMPT_MAX),
  sections: z.array(z.string().min(1).max(AUDIO_MUSIC_PROMPT_MAX)).max(AUDIO_SECTIONS_MAX),
  model: z.string(),
});
export type AudioExpandResult = z.infer<typeof AudioExpandResultSchema>;
