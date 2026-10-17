import { userInfo } from 'node:os';

import { BrowserWindow, dialog, nativeImage, shell } from 'electron';
import {
  createModelRuntime,
  createModelTools,
  mediaModelMain,
  MODEL_LLM_TIMEOUT_MS,
  type OllamaSeam,
} from '@midnite/studio-feature-media-model/main';
import { getConfiguredOllamaHost, ollamaChat, ollamaShow, ollamaTags, resolveOllamaBaseUrl } from '@midnite/studio-feature-models/main';
import { getGlobalGitIdentity } from '@midnite/studio-git-engine';
import type { FeatureMainContext } from '@midnite/studio-runtime';
import {
  EVENT_CHANNELS,
  failure,
  loopModelArgs,
  ok,
  type GitOpResult,
  type LoopModel,
  type Sf3dGenerateRequest,
  type Sf3dGenerateResult,
  type Sf3dRequest,
} from '@midnite/studio-shared';

import { runHeadlessText, defaultAiImproveFieldDeps } from '../ai/improve-field';
import { setModelTools } from '../mcp/model-tools';
import { resolveRegisteredRepo } from '../mcp/tools';
import { createIterativeHost } from '../media/iterative-host';
import { resolveWorkdir } from '../repo-registry';
import { broadcastToAllWindows } from '../window-manager';
import { handle, handleBare, handleSend } from './handle';
import { mediaStore, notifyMediaChanged } from './media-handlers';

/**
 * Media ▸ Models — LLM-authored 3D, composed here from the `media-model` feature (Phase 113 Theme S). The
 * engine is a local Ollama model (default) or a headless agent CLI from the roster; the picture attachment is
 * read by an Ollama vision model. Files land under `.midnite/media/model/<project>/` through the media
 * store's jail. The feature owns the service, library, sculpt store and the eight channels; this is Studio's
 * half of them — the Ollama client, the roster's agents, the iterative MCP harness, the Trash and the save
 * dialog. Gamer wires its own.
 */
const ollamaBaseUrl = async (): Promise<string> => (await getConfiguredOllamaHost()) ?? resolveOllamaBaseUrl();

const ollama: OllamaSeam = {
  chat: async (req, opts) => ollamaChat(req, { baseUrl: await ollamaBaseUrl(), ...opts }),
  tags: async () => ollamaTags({ baseUrl: await ollamaBaseUrl(), timeoutMs: 1500 }),
  capabilities: async (model) => (await ollamaShow(model, { baseUrl: await ollamaBaseUrl(), timeoutMs: 1500 })).capabilities ?? [],
};

/** Ollama + agent engines; also the vision model the sprite consistency check uses (Phase 106 Theme D). */
export const engines = {
  ollama,
  runAgent: async (req: { agentId: string; model: LoopModel | undefined; repoId: string; prompt: string }) =>
    runHeadlessText(
      {
        prompt: req.prompt,
        agentId: req.agentId,
        repoPath: (await resolveWorkdir(req.repoId)) ?? null,
        modelArgs: (agentId) => (req.model ? loopModelArgs(agentId, req.model) : []),
        what: 'the 3D model generator',
      },
      defaultAiImproveFieldDeps,
      MODEL_LLM_TIMEOUT_MS,
    ),
};

/** Who `model.json` names as the author: the global git identity, else the OS user. */
export async function modelAuthor(): Promise<{ name: string; email?: string }> {
  const identity = await getGlobalGitIdentity();
  if (identity.ok && identity.value.name) return { name: identity.value.name, ...(identity.value.email ? { email: identity.value.email } : {}) };
  return { name: userInfo().username || 'unknown' };
}

/**
 * The SF3D engine and dispatcher, set once `configureSf3d` has built its service
 * (`media-model-sf3d-handlers.ts`) — a late binding rather than an import, because that module imports this one.
 */
type Sf3dEngine = {
  generate: (req: Sf3dGenerateRequest) => Promise<GitOpResult<Sf3dGenerateResult>>;
  cancel: (generationId: string) => Promise<GitOpResult>;
};
let sf3dEngine: Sf3dEngine | null = null;
export function setSf3dEngine(engine: Sf3dEngine | null): void {
  sf3dEngine = engine;
}
type Sf3dDispatch = (req: Sf3dRequest) => Promise<GitOpResult<unknown> | GitOpResult>;
let sf3dDispatch: Sf3dDispatch | null = null;
export function setSf3dDispatcher(dispatch: Sf3dDispatch | null): void {
  sf3dDispatch = dispatch;
}

/** Shrinks a reference picture to fit an MCP response (the response cap is 4 MB, base64 included). */
async function shrinkImage(data: Buffer, mime: string): Promise<{ data: Buffer; mime: string }> {
  const image = nativeImage.createFromBuffer(data);
  const { width, height } = image.getSize();
  if (width === 0 || height === 0) return { data, mime };
  const scale = Math.min(1, 1024 / Math.max(width, height));
  const resized = scale < 1 ? image.resize({ width: Math.round(width * scale), height: Math.round(height * scale) }) : image;
  return { data: resized.toJPEG(85), mime: 'image/jpeg' };
}

/** Decodes a JPEG/WebP reference picture to RGBA for `model_compare_reference` (`toBitmap` is BGRA). */
async function decodeImage(data: Buffer): Promise<{ width: number; height: number; data: Uint8Array } | null> {
  const image = nativeImage.createFromBuffer(data);
  const { width, height } = image.getSize();
  if (width === 0 || height === 0) return null;
  const bgra = image.toBitmap();
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    out[i * 4] = bgra[i * 4 + 2]!;
    out[i * 4 + 1] = bgra[i * 4 + 1]!;
    out[i * 4 + 2] = bgra[i * 4]!;
    out[i * 4 + 3] = bgra[i * 4 + 3]!;
  }
  return { width, height, data: out };
}

const runtime = createModelRuntime({
  rootFor: (repoId) => mediaStore.rootFor({ repoId, tab: 'model' }),
  createGroup: (repoId, name) => mediaStore.createProject({ repoId, tab: 'model', project: name }),
  trash: (absPath) => shell.trashItem(absPath),
  author: modelAuthor,
  writeBytes: (req) => mediaStore.writeBytes(req),
  readBytes: (req) => mediaStore.readBytes(req),
  onChanged: (repoId) => notifyMediaChanged(repoId, 'model'),
  emit: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaModelProgress, event),
  ollama,
  runAgent: engines.runAgent,
  // Agent CLIs that speak MCP iterate through the model_* tools instead of writing the design once.
  iterative: {
    host: createIterativeHost(),
    tools: () => modelTools,
    repoPath: async (repoId) => (await resolveWorkdir(repoId)) ?? null,
    modelArgs: (engine) => (engine.model ? loopModelArgs(engine.agentId, engine.model) : []),
  },
  sf3d: {
    generate: (req) => (sf3dEngine ? sf3dEngine.generate(req) : Promise.resolve(failure('SF3D is still starting up; try again in a moment.'))),
    cancel: (generationId) => (sf3dEngine ? sf3dEngine.cancel(generationId) : failure('Nothing to cancel.')),
  },
});

const { service, sculptStore } = runtime;

/**
 * The `model_*` MCP tools, over the same media store and service as the tab. The app's global MCP
 * server answers them behind the `allowModels` switch (`mcp/model-tools.ts`); an iterative run
 * answers them on its own private server.
 */
const modelTools = createModelTools({
  resolveRepo: async (repoPath) => {
    const resolved = await resolveRegisteredRepo(repoPath);
    if (resolved.ok) return { ok: true, repoId: resolved.repo.descriptor.id };
    return { ok: false, kind: resolved.error.kind === 'not-found' ? 'not-found' : 'refused', message: resolved.error.message };
  },
  listProjects: (repoId) => mediaStore.listProjects({ repoId, tab: 'model' }),
  listFiles: (scope) => mediaStore.listFiles(scope),
  readBytes: async (req) => {
    const read = await mediaStore.readFile({ ...req, encoding: 'base64' });
    return read.ok ? ok(Buffer.from(read.value, 'base64')) : read;
  },
  saveSpec: (req) => service.saveEdit(req),
  writeSidecar: (req) => service.writeSidecar(req),
  writeMesh: (req) => sculptStore.handle(req),
  writeFile: (req) => mediaStore.writeBytes(req),
  exportModel: (req) => service.exportModel(req),
  createModel: (req) => service.createModel(req),
  emitChanged: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaModelChanged, event),
  emitOpen: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaModelOpen, event),
  shrinkImage,
  decodeImage,
});
setModelTools(modelTools);

/** An imported mesh (an SF3D result) as a design in the library — `ModelService.importAsset`. */
export const importModelAsset: typeof service.importAsset = (req) => service.importAsset(req);

export function registerMediaModelHandlers(): void {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: broadcastToAllWindows,
    trashItem: () => Promise.reject(new Error('models never trash through this context')),
  };
  mediaModelMain.register(ctx, {
    runtime,
    pickSavePath: async (options) => {
      const win = BrowserWindow.getFocusedWindow();
      const picked = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
      return picked.canceled || !picked.filePath ? null : picked.filePath;
    },
    sf3d: (req) => (sf3dDispatch ? sf3dDispatch(req) : Promise.resolve(failure('SF3D is still starting up; try again in a moment.'))),
  });
}
