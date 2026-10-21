import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS, failure, MEDIA_EXPORT_FORMAT_INFO, ok, schemas, type GitOpResult, type Sf3dRequest } from '@midnite/studio-shared';

import { mediaModelManifest } from '../manifest';
import type { ModelRuntime } from './model/model-runtime';

export { mediaModelManifest, type MediaModelManifest } from '../manifest';
export { createModelRuntime, type ModelRuntime, type ModelRuntimeDeps } from './model/model-runtime';
export { createModelService, type ModelService, type ModelServiceDeps } from './model/model-service';
export { createModelLibrary, type ModelLibrary, type ModelLibraryDeps } from './model/model-library';
export { createSculptStore, type SculptStore, type SculptStoreDeps } from './model/sculpt-store';
export { createModelTools, type ModelMcpDeps, type ModelTools } from './model/model-mcp';
export {
  createDescribeImage,
  createLlmCall,
  createVisionCall,
  probeProviders,
  MODEL_LLM_TIMEOUT_MS,
  type EngineDeps,
  type OllamaChatMessage,
  type OllamaSeam,
  type VisionCall,
} from './model/engines';
export {
  buildCliArgs,
  MODEL_ITERATIVE_MAX_CALLS,
  MODEL_ITERATIVE_TIMEOUT_MS,
  type CliRequest,
  type CliResult,
  type IterativeHost,
  type ResolvedAgent,
  type ScopedDispatch,
} from './model/iterative';
export { createSf3dInstaller, type Sf3dInstaller } from './model/sf3d/installer';
export { createSf3dBroker, sf3dWorkerScriptPath, type Sf3dBroker, type Sf3dWorkerHandle } from './model/sf3d/sf3d-broker';
export { createSf3dMcpTools, SF3D_NOT_READY_HINT, type Sf3dMcpTools } from './model/sf3d/sf3d-mcp';
export { createSf3dService, type Sf3dService } from './model/sf3d/sf3d-service';
export type { RgbaImage } from './model/sf3d/prepare-image';
export { memoryModelKit, BOX_SPEC, type MemoryModelKit } from './model/model-test-kit';

/**
 * The Model feature's main half (Phase 113 Theme S): the library, the sculpt store, generation, export and
 * the SF3D dispatcher behind eight channels. `model-runtime.ts` wires the services from injected deps; this
 * file registers the channels over them.
 *
 * Two native pieces it needs arrive as plain functions: the save dialog for an export (`pickSavePath`, the
 * composer's `dialog.showSaveDialog`) and the SF3D dispatcher (`sf3d`, which only a composer that carries the
 * ONNX worker can supply). Nothing here imports `electron`.
 */
export type MediaModelMainServices = {
  runtime: ModelRuntime;
  /** The export save dialog: an absolute path, or null when dismissed. */
  pickSavePath: (options: { defaultPath: string; filters: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  /** The one dispatcher the SF3D channel and the `model_*` SF3D tools share. */
  sf3d: (req: Sf3dRequest) => Promise<GitOpResult<unknown> | GitOpResult>;
};

const caught = (error: unknown) => failure(error instanceof Error ? error.message : String(error));

export const mediaModelMain = defineFeatureMain<MediaModelMainServices>({
  feature: mediaModelManifest.feature,
  channels: mediaModelManifest.ipc,
  register(ctx, { runtime, pickSavePath, sf3d }) {
    const { handle, handleBare } = ctx.ipc;
    const { service, library, sculptStore } = runtime;
    const invalid = (issue: string) => failure(issue);
    handle(
      CHANNELS.mediaModelMesh,
      schemas.MediaModelMeshRequest,
      async (req) => {
        try {
          return await sculptStore.handle(req);
        } catch (error) {
          return caught(error);
        }
      },
      invalid,
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
          return caught(error);
        }
      },
      invalid,
    );
    handleBare(CHANNELS.mediaModelProviders, async () => ({ providers: await runtime.providers() }));
    handle(
      CHANNELS.mediaModelGenerate,
      schemas.MediaModelGenerateRequest,
      async (req) => {
        try {
          return await service.generate(req);
        } catch (error) {
          return caught(error);
        }
      },
      invalid,
    );
    handle(CHANNELS.mediaModelCancel, schemas.MediaModelCancelRequest, ({ generationId }) => service.cancel(generationId), invalid);
    handle(
      CHANNELS.mediaModelSaveEdit,
      schemas.MediaModelSaveEditRequest,
      async (req) => {
        try {
          return await service.saveEdit(req);
        } catch (error) {
          return caught(error);
        }
      },
      invalid,
    );
    handle(
      CHANNELS.mediaModelExport,
      schemas.MediaModelExportRequest,
      async (req) => {
        try {
          const built = await service.exportBytes(req);
          if (!built.ok) return built;
          const { ext, label } = MEDIA_EXPORT_FORMAT_INFO[req.format];
          const dest = await pickSavePath({
            defaultPath: join(req.defaultDir ?? '', built.value.fileName),
            filters: [{ name: label, extensions: [ext] }],
          });
          if (!dest) return failure('cancelled');
          await mkdir(dirname(dest), { recursive: true });
          await writeFile(dest, built.value.data);
          for (const extra of built.value.extras) await writeFile(join(dirname(dest), extra.fileName), extra.data);
          return ok({ dest });
        } catch (error) {
          return caught(error);
        }
      },
      invalid,
    );
    handle(CHANNELS.mediaModelSf3d, schemas.MediaModelSf3dRequest, (req) => sf3d(req), invalid);
  },
});
