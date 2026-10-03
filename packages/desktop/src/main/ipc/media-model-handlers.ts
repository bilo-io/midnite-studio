import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { dialog } from 'electron';

import {
  CHANNELS,
  EVENT_CHANNELS,
  failure,
  loopModelArgs,
  MEDIA_EXPORT_FORMAT_INFO,
  ok,
  schemas,
} from '@midnite/studio-shared';

import { runHeadlessText, defaultAiImproveFieldDeps } from '../ai/improve-field';
import { createDescribeImage, createLlmCall, probeProviders, MODEL_LLM_TIMEOUT_MS, type OllamaSeam } from '../media/model/engines';
import { createModelService } from '../media/model/model-service';
import { ollamaChat, ollamaShow, ollamaTags, resolveOllamaBaseUrl } from '../ollama/client';
import { getConfiguredOllamaHost } from '../ollama/settings-service';
import { resolveWorkdir } from '../repo-registry';
import { broadcastToAllWindows } from '../window-manager';
import { handle, handleBare, handleFromSender } from './handle';
import { mediaStore } from './media-handlers';

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

const engines = {
  ollama,
  runAgent: async (req: { agentId: string; model: string | undefined; repoId: string; prompt: string }) =>
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

const service = createModelService({
  llm: createLlmCall(engines),
  describeImage: createDescribeImage(engines),
  writeBytes: (req) => mediaStore.writeBytes(req),
  readBytes: async (req) => {
    const read = await mediaStore.readFile({ ...req, encoding: 'base64' });
    return read.ok ? ok(Buffer.from(read.value, 'base64')) : read;
  },
  emit: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaModelProgress, event),
});

export function registerMediaModelHandlers(): void {
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
