import {
  failure,
  imageModelSupportsReference,
  imageProviderInfo,
  imageReferenceUnsupportedReason,
  IMAGE_PROVIDER_IDS,
  ok,
  type GitOpResult,
  type ImageAspect,
  type ImageGenerateProgressEvent,
  type ImageGenerateRequest,
  type ImageModelInfo,
  type ImageProviderId,
  type ImageProviderStatus,
  type ImageSidecar,
  type SecretKey,
} from '@midnite/studio-shared';

import { EXT_BY_MIME, ImageProviderError, type GeneratedImage, type ImageProvider } from './types';

/**
 * Orchestrates one image generation (Phase 99 Theme C): resolves the key from
 * the vault, runs the provider adapter, writes each image and its `<name>.json`
 * sidecar into `.midnite/media/image/<project>/` through the media store, and
 * streams progress. Cancellable by `generationId`. Never throws — every
 * outcome is a `GitOpResult`.
 */
export type ImageServiceDeps = {
  providers: Record<ImageProviderId, ImageProvider>;
  readKey: (key: SecretKey) => Promise<string | null>;
  writeFile: (req: {
    repoId: string;
    tab: 'image';
    project: string;
    path: string;
    content: string;
    encoding: 'utf8' | 'base64';
  }) => Promise<GitOpResult<unknown>>;
  emit: (event: ImageGenerateProgressEvent) => void;
  fetch: typeof fetch;
  /** Ollama's image-output models; `[]` when the daemon is down or has none. */
  discoverOllamaModels: () => Promise<ImageModelInfo[]>;
  /** Whether the Antigravity CLI can be launched — the key-free path every keyed provider falls back to. */
  agyAvailable: () => Promise<boolean>;
  /**
   * Reads a reference image named by `ImageGenerateRequest.references` — a path inside the repo's
   * `.midnite/media/`, confined by the media store. Absent: requests with references are refused.
   */
  readReference?: (repoId: string, path: string) => Promise<GitOpResult<GeneratedImage>>;
  now?: () => Date;
};

/** One image as bytes, not written anywhere — what the sprite frame sources draw with (Phase 106 Theme D). */
export type ImageBytesRequest = {
  provider: ImageProviderId;
  model: string;
  prompt: string;
  aspect: ImageAspect;
  transparent?: boolean | undefined;
  references?: readonly GeneratedImage[] | undefined;
  signal: AbortSignal;
};

/** `"A red fox, at dusk!"` → `a-red-fox-at-dusk`, capped so file names stay readable. */
export function promptSlug(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug || 'image';
}

/** `20260930-141502` — sorts lexically in time order, which is gallery order. */
export function timeStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

export function imageFileName(base: string, index: number, total: number, mime: string): string {
  const ext = EXT_BY_MIME[mime] ?? 'png';
  return `${base}${total > 1 ? `-${index + 1}` : ''}.${ext}`;
}

const NO_KEY_NO_AGY = 'Add an API key in Settings ▸ Media, or install the Antigravity CLI (agy).';

export function createImageService(deps: ImageServiceDeps) {
  const running = new Map<string, AbortController>();
  const now = deps.now ?? (() => new Date());

  async function providerStatuses(): Promise<ImageProviderStatus[]> {
    return Promise.all(
      IMAGE_PROVIDER_IDS.map(async (id): Promise<ImageProviderStatus> => {
        const info = imageProviderInfo(id);
        if (info.disabledReason) {
          return { id, available: false, reason: info.disabledReason, missingKey: false, models: [] };
        }
        if (id === 'agy') {
          return (await deps.agyAvailable().catch(() => false))
            ? { id, available: true, missingKey: false, models: [] }
            : { id, available: false, reason: NO_KEY_NO_AGY, missingKey: false, models: [] };
        }
        if (id === 'ollama') {
          const models = await deps.discoverOllamaModels().catch(() => []);
          return models.length > 0
            ? { id, available: true, missingKey: false, models }
            : { id, available: false, reason: 'No Ollama models with image output are installed.', missingKey: false, models: [] };
        }
        if (info.secretKey && !(await deps.readKey(info.secretKey))) {
          // API keys are optional: with no key, generation routes through the agy CLI.
          return (await deps.agyAvailable().catch(() => false))
            ? { id, available: true, reason: `No ${info.label} API key — will generate through the Antigravity CLI.`, missingKey: true, models: [] }
            : { id, available: false, reason: `Add a ${info.label} API key in Settings ▸ Media, or install the Antigravity CLI (agy).`, missingKey: true, models: [] };
        }
        return { id, available: true, missingKey: false, models: [] };
      }),
    );
  }

  type Route = { provider: ImageProviderId; model: string; apiKey: string | null };

  /**
   * Which adapter runs a request, with which key. No key routes through the agy CLI — except with
   * reference images, which the CLI cannot take, so that is refused with the fix instead.
   */
  async function route(requested: ImageProviderId, requestedModel: string, withReferences: boolean): Promise<GitOpResult<Route>> {
    const info = imageProviderInfo(requested);
    if (info.disabledReason) return failure(info.disabledReason);
    if (withReferences && !imageModelSupportsReference(requested, requestedModel)) {
      return failure(imageReferenceUnsupportedReason(requested === 'gemini' ? 'Imagen' : info.label));
    }
    const apiKey = info.secretKey ? await deps.readKey(info.secretKey) : null;
    if (info.secretKey && !apiKey) {
      if (withReferences) return failure(`A reference image needs the ${info.label} API — add a ${info.label} API key in Settings ▸ Media.`);
      // No key: route through the agy CLI, or say plainly that neither exists.
      if (!(await deps.agyAvailable().catch(() => false))) {
        return failure(`No ${info.label} API key and the Antigravity CLI (agy) was not found. ${NO_KEY_NO_AGY}`);
      }
      return ok({ provider: 'agy', model: 'agy-default', apiKey: null });
    }
    if (requested === 'agy' && !(await deps.agyAvailable().catch(() => false))) return failure(NO_KEY_NO_AGY);
    return ok({ provider: requested, model: requestedModel, apiKey });
  }

  async function generate(req: ImageGenerateRequest): Promise<GitOpResult<{ files: string[] }>> {
    if (running.has(req.generationId)) return failure('This generation is already running.');
    const references: GeneratedImage[] = [];
    for (const path of req.references ?? []) {
      if (!deps.readReference) return failure('Reference images are not available here.');
      const read = await deps.readReference(req.repoId, path);
      if (!read.ok) return read;
      references.push(read.value);
    }
    const routed = await route(req.provider, req.model, references.length > 0);
    if (!routed.ok) return routed;
    const { provider, model, apiKey } = routed.value;

    const controller = new AbortController();
    running.set(req.generationId, controller);
    const createdAt = now();
    const base = `${promptSlug(req.prompt)}-${timeStamp(createdAt)}`;
    const files: string[] = [];
    const progress = (status: ImageGenerateProgressEvent['status'], error?: string) =>
      deps.emit({
        generationId: req.generationId,
        repoId: req.repoId,
        project: req.project,
        status,
        completed: files.length,
        total: req.count,
        files: [...files],
        ...(error ? { error } : {}),
      });

    const land = async (image: GeneratedImage, index: number): Promise<void> => {
      const file = imageFileName(base, index, req.count, image.mime);
      const scope = { repoId: req.repoId, tab: 'image' as const, project: req.project };
      const wrote = await deps.writeFile({ ...scope, path: file, content: image.bytes.toString('base64'), encoding: 'base64' });
      if (!wrote.ok) throw new ImageProviderError(wrote.kind === 'error' ? wrote.message : 'Could not write the image.');
      const sidecar: ImageSidecar = {
        version: 1,
        file,
        prompt: req.prompt,
        provider,
        model,
        aspect: req.aspect,
        ...(req.seed !== undefined ? { seed: req.seed + index } : {}),
        createdAt: createdAt.toISOString(),
      };
      const sidecarPath = file.replace(/\.[^.]+$/, '.json');
      await deps.writeFile({ ...scope, path: sidecarPath, content: JSON.stringify(sidecar, null, 2) + '\n', encoding: 'utf8' });
      files.push(file);
      progress('running');
    };

    progress('running');
    let chain = Promise.resolve();
    let landed = 0;
    try {
      await deps.providers[provider].generate(
        {
          prompt: req.prompt,
          model,
          aspect: req.aspect,
          count: req.count,
          seed: req.seed,
          ...(req.transparent ? { transparent: true } : {}),
          ...(references.length > 0 ? { references } : {}),
        },
        {
          fetch: deps.fetch,
          apiKey,
          signal: controller.signal,
          onImage: (image) => {
            const index = landed++;
            chain = chain.then(() => land(image, index));
          },
        },
      );
      await chain;
      progress('succeeded');
      return ok({ files });
    } catch (error) {
      await chain.catch(() => undefined);
      if (controller.signal.aborted) {
        progress('cancelled');
        return failure('cancelled');
      }
      const message = error instanceof Error ? error.message : String(error);
      progress('failed', message);
      return failure(message);
    } finally {
      running.delete(req.generationId);
    }
  }

  /**
   * One image as bytes, through the same key routing as {@link generate} but with no file, sidecar or
   * progress event: the caller (a sprite job) owns where the result goes and how it is cancelled.
   */
  async function generateImage(req: ImageBytesRequest): Promise<GitOpResult<GeneratedImage>> {
    const routed = await route(req.provider, req.model, (req.references?.length ?? 0) > 0);
    if (!routed.ok) return routed;
    const { provider, model, apiKey } = routed.value;
    try {
      const [image] = await deps.providers[provider].generate(
        {
          prompt: req.prompt,
          model,
          aspect: req.aspect,
          count: 1,
          ...(req.transparent ? { transparent: true } : {}),
          ...(req.references?.length ? { references: req.references } : {}),
        },
        { fetch: deps.fetch, apiKey, signal: req.signal },
      );
      return image ? ok(image) : failure(`${imageProviderInfo(provider).label} returned no image.`);
    } catch (error) {
      if (req.signal.aborted) return failure('cancelled');
      return failure(error instanceof Error ? error.message : String(error));
    }
  }

  function cancel(generationId: string): GitOpResult {
    const controller = running.get(generationId);
    if (!controller) return failure('Nothing to cancel.');
    controller.abort();
    return ok();
  }

  return { generate, generateImage, cancel, providerStatuses };
}

export type ImageService = ReturnType<typeof createImageService>;
