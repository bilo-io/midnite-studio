import {
  MEDIA_ROOT_DIR,
  MODEL_DEFAULT_TEXT_MODEL,
  MODEL_IMAGE_MAX_BYTES,
  MODEL_IMAGE_MIMES,
  MODEL_SUGGESTED_TEXT,
  modelFileExtension,
  mstudioFileUrl,
  type ModelImageAttachment,
  type ModelOllamaModel,
  type ModelProviders,
} from '@midnite/studio-shared';

/** The `mstudio-file://` URL of a file in `.midnite/media/model/<project>/`. */
export const modelFileUrl = (repoId: string, project: string, path: string): string =>
  mstudioFileUrl('repo', repoId, `${MEDIA_ROOT_DIR}/model/${project}/${path}`);

/** `a/robot.obj` → `a/robot.mtl`, the materials file an OBJ names. */
export const mtlPathFor = (objPath: string): string => objPath.replace(/\.[^./]+$/, '.mtl');

export const viewerFormat = (path: string): 'obj' | 'fbx' | null => modelFileExtension(path);

/**
 * Where to put a perspective camera so a bounding box fills the view: back
 * along `direction` far enough that the box's bounding sphere fits both the
 * vertical and (for a narrow pane) the horizontal field of view.
 */
export function framingFor(input: {
  size: readonly [number, number, number];
  center: readonly [number, number, number];
  fovDeg: number;
  aspect: number;
  direction?: readonly [number, number, number];
}): { position: [number, number, number]; distance: number; near: number; far: number } {
  const radius = Math.max(Math.hypot(input.size[0], input.size[1], input.size[2]) / 2, 1e-3);
  const vertical = (input.fovDeg * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * Math.max(input.aspect, 0.1));
  const distance = (radius / Math.sin(Math.min(vertical, horizontal) / 2)) * 1.05;
  const [dx, dy, dz] = input.direction ?? [0.8, 0.55, 1];
  const length = Math.hypot(dx, dy, dz) || 1;
  return {
    position: [
      input.center[0] + (dx / length) * distance,
      input.center[1] + (dy / length) * distance,
      input.center[2] + (dz / length) * distance,
    ],
    distance,
    near: Math.max(distance / 1000, 1e-3),
    far: distance * 100,
  };
}

/** The installed text-capable models, the suggested one first. */
export function textModels(models: readonly ModelOllamaModel[]): ModelOllamaModel[] {
  const usable = models.filter((m) => !m.embedding);
  const rank = (id: string): number => {
    const index = MODEL_SUGGESTED_TEXT.findIndex((s) => s.id === id);
    return index < 0 ? MODEL_SUGGESTED_TEXT.length : index;
  };
  return [...usable].sort((a, b) => rank(a.id) - rank(b.id));
}

export const visionModels = (models: readonly ModelOllamaModel[]): ModelOllamaModel[] => models.filter((m) => m.vision);

/** The Ollama model to use: the remembered one when still installed, else the best installed, else the default. */
export function pickOllamaModel(models: readonly ModelOllamaModel[], preferred: string): string {
  const installed = textModels(models);
  if (installed.some((m) => m.id === preferred)) return preferred;
  return installed[0]?.id ?? MODEL_DEFAULT_TEXT_MODEL;
}

export type EngineChoice = { id: string; model: string };

/** Why Generate is off, or `undefined` when it can run. */
export function generateBlockedReason(input: {
  prompt: string;
  image: ModelImageAttachment | null;
  running: boolean;
  engine: EngineChoice;
  providers: ModelProviders | undefined;
}): string | undefined {
  if (input.running) return 'Generating…';
  if (input.prompt.trim().length === 0 && !input.image) return 'Describe the model or attach an image.';
  if (input.engine.id === 'ollama') {
    const ollama = input.providers?.ollama;
    if (ollama && !ollama.available) return ollama.reason ?? 'Ollama is not running.';
    if (ollama && textModels(ollama.models).length === 0) return `No Ollama model is installed. Run \`ollama pull ${MODEL_DEFAULT_TEXT_MODEL}\`.`;
  }
  if (input.image && input.providers && !input.providers.ollama.available) {
    return 'Reading an image needs Ollama (a vision model). Start it, or remove the image.';
  }
  return undefined;
}

export type ImageReadResult = { ok: true; attachment: ModelImageAttachment } | { ok: false; error: string };

/** Read a picked or dropped file into the wire attachment, refusing what main would. */
export async function readImageAttachment(file: File): Promise<ImageReadResult> {
  if (!(MODEL_IMAGE_MIMES as readonly string[]).includes(file.type)) {
    return { ok: false, error: 'Attach a PNG, JPEG, WebP or GIF image.' };
  }
  if (file.size > MODEL_IMAGE_MAX_BYTES) {
    return { ok: false, error: `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${MODEL_IMAGE_MAX_BYTES / 1024 / 1024} MB.` };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return {
    ok: true,
    attachment: { name: file.name || 'image', mime: file.type as ModelImageAttachment['mime'], data: btoa(binary) },
  };
}
