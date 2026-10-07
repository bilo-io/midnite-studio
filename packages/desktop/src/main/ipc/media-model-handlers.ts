import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { userInfo } from 'node:os';

import { dialog, nativeImage, shell } from 'electron';
import { getGlobalGitIdentity } from '@midnite/studio-git-engine';

import {
  CHANNELS,
  EVENT_CHANNELS,
  failure,
  loopModelArgs,
  MEDIA_EXPORT_FORMAT_INFO,
  ok,
  schemas,
  type GitOpResult,
  type LoopModel,
  type Sf3dGenerateRequest,
  type Sf3dGenerateResult,
} from '@midnite/studio-shared';

import { runHeadlessText, defaultAiImproveFieldDeps } from '../ai/improve-field';
import { setModelTools } from '../mcp/model-tools';
import { resolveRegisteredRepo } from '../mcp/tools';
import { createIterativeHost } from '../media/model/iterative-host';
import { createModelTools } from '../media/model/model-mcp';
import { createDescribeImage, createLlmCall, probeProviders, MODEL_LLM_TIMEOUT_MS, type OllamaSeam } from '../media/model/engines';
import { createModelService } from '../media/model/model-service';
import { ollamaChat, ollamaShow, ollamaTags, resolveOllamaBaseUrl } from '../ollama/client';
import { getConfiguredOllamaHost } from '../ollama/settings-service';
import { resolveWorkdir } from '../repo-registry';
import { broadcastToAllWindows } from '../window-manager';
import { handle, handleBare, handleFromSender } from './handle';
import { createModelLibrary } from '../media/model/model-library';
import { createSculptStore } from '../media/model/sculpt-store';
import { mediaStore, notifyMediaChanged } from './media-handlers';

/**
 * Media ▸ Models — LLM-authored 3D (`main/media/model/`). The engine is a local
 * Ollama model (default) or a headless agent CLI from the roster; the picture
 * attachment is read by an Ollama vision model. Files land under
 * `.midnite/media/model/<project>/` through the media store's jail.
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
 * The SF3D engine, set once `configureSf3d` has built its service (`media-model-sf3d-handlers.ts`) —
 * a late binding rather than an import, because that module imports this one.
 */
type Sf3dEngine = {
  generate: (req: Sf3dGenerateRequest) => Promise<GitOpResult<Sf3dGenerateResult>>;
  cancel: (generationId: string) => Promise<GitOpResult>;
};
let sf3dEngine: Sf3dEngine | null = null;
export function setSf3dEngine(engine: Sf3dEngine | null): void {
  sf3dEngine = engine;
}

const service = createModelService({
  sf3d: {
    generate: (req) => (sf3dEngine ? sf3dEngine.generate(req) : Promise.resolve(failure('SF3D is still starting up; try again in a moment.'))),
    cancel: (generationId) => (sf3dEngine ? sf3dEngine.cancel(generationId) : failure('Nothing to cancel.')),
  },
  author: modelAuthor,
  llm: createLlmCall(engines),
  describeImage: createDescribeImage(engines),
  writeBytes: (req) => mediaStore.writeBytes(req),
  readBytes: async (req) => {
    const read = await mediaStore.readFile({ ...req, encoding: 'base64' });
    return read.ok ? ok(Buffer.from(read.value, 'base64')) : read;
  },
  emit: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaModelProgress, event),
  // Agent CLIs that speak MCP iterate through the model_* tools instead of writing the design once.
  iterative: {
    host: createIterativeHost(),
    tools: () => modelTools,
    repoPath: async (repoId) => (await resolveWorkdir(repoId)) ?? null,
    modelArgs: (engine) => (engine.model ? loopModelArgs(engine.agentId, engine.model) : []),
  },
});

/** Shrinks a reference picture to fit an MCP response (the response cap is 4 MB, base64 included). */
async function shrinkImage(data: Buffer, mime: string): Promise<{ data: Buffer; mime: string }> {
  const image = nativeImage.createFromBuffer(data);
  const { width, height } = image.getSize();
  if (width === 0 || height === 0) return { data, mime };
  const scale = Math.min(1, 1024 / Math.max(width, height));
  const resized = scale < 1 ? image.resize({ width: Math.round(width * scale), height: Math.round(height * scale) }) : image;
  return { data: resized.toJPEG(85), mime: 'image/jpeg' };
}

/**
 * The `model_*` MCP tools, over the same media store and service as the tab. The app's global MCP
 * server answers them behind the `allowModels` switch (`mcp/model-tools.ts`); an iterative run
 * answers them on its own private server.
 */
/** Sculpt mesh binaries and their op logs (Phase 104 Theme A), inside the media store's jail. */
const sculptStore = createSculptStore({
  readBytes: (req) => mediaStore.readBytes(req),
  writeBytes: (req) => mediaStore.writeBytes(req),
});

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
});
setModelTools(modelTools);

/** An imported mesh (an SF3D result) as a design in the library — `ModelService.importAsset`. */
export const importModelAsset: typeof service.importAsset = (req) => service.importAsset(req);

const library = createModelLibrary({
  rootFor: (repoId) => mediaStore.rootFor({ repoId, tab: 'model' }),
  createGroup: (repoId, name) => mediaStore.createProject({ repoId, tab: 'model', project: name }),
  trash: (absPath) => shell.trashItem(absPath),
  onChanged: (repoId) => notifyMediaChanged(repoId, 'model'),
  author: modelAuthor,
});

export function registerMediaModelHandlers(): void {
  handle(
    CHANNELS.mediaModelMesh,
    schemas.MediaModelMeshRequest,
    async (req) => {
      try {
        return await sculptStore.handle(req);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
    (issue) => failure(issue),
  );
  handle(
    CHANNELS.mediaModelLibrary,
    schemas.MediaModelLibraryRequest,
    async (req) => {
      try {
        switch (req.op) {
          case 'list':
            return await library.list(req.repoId);
          case 'migrate':
            return await library.migrate(req.repoId);
          case 'rename':
            return await library.rename(req);
          case 'move':
            return await library.move(req);
          case 'delete':
            return await library.delete(req);
          case 'duplicate':
            return await library.duplicate(req);
          case 'newGroup':
            return await library.newGroup(req);
        }
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
    (issue) => failure(issue),
  );
  handleBare(CHANNELS.mediaModelProviders, async () => ({ providers: await probeProviders(ollama) }));
  handle(
    CHANNELS.mediaModelGenerate,
    schemas.MediaModelGenerateRequest,
    async (req) => {
      try {
        return await service.generate(req);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
    (issue) => failure(issue),
  );
  handle(
    CHANNELS.mediaModelCancel,
    schemas.MediaModelCancelRequest,
    ({ generationId }) => service.cancel(generationId),
    (issue) => failure(issue),
  );
  handle(
    CHANNELS.mediaModelSaveEdit,
    schemas.MediaModelSaveEditRequest,
    async (req) => {
      try {
        return await service.saveEdit(req);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
    (issue) => failure(issue),
  );
  handleFromSender(
    CHANNELS.mediaModelExport,
    schemas.MediaModelExportRequest,
    async (req, win) => {
      try {
        const built = await service.exportBytes(req);
        if (!built.ok) return built;
        const { ext, label } = MEDIA_EXPORT_FORMAT_INFO[req.format];
        const options = {
          defaultPath: join(req.defaultDir ?? '', built.value.fileName),
          filters: [{ name: label, extensions: [ext] }],
        };
        const picked = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
        if (picked.canceled || !picked.filePath) return failure('cancelled');
        await mkdir(dirname(picked.filePath), { recursive: true });
        await writeFile(picked.filePath, built.value.data);
        for (const extra of built.value.extras) await writeFile(join(dirname(picked.filePath), extra.fileName), extra.data);
        return ok({ dest: picked.filePath });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
    (issue) => failure(issue),
  );
}
