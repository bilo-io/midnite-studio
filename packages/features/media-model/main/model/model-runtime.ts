import type { GitOpResult, ModelGenerateProgressEvent } from '@midnite/studio-shared';

import { createDescribeImage, createLlmCall, probeProviders, type EngineDeps, type OllamaSeam } from './engines';
import { createModelLibrary, type ModelLibraryDeps } from './model-library';
import { createModelService, type ModelServiceDeps } from './model-service';
import { createSculptStore } from './sculpt-store';

type Scope = { repoId: string; tab: 'model'; project: string };

/**
 * Everything the Model feature's main half needs from the app that composes it (Phase 113 Theme S).
 *
 * The media store arrives as plain functions (`rootFor`, `createGroup`, `readBytes`, `writeBytes`), Electron's
 * Trash and the window's change events as callbacks, and the three things Models asks of the rest of the app as
 * seams: the Ollama client (`ollama`), a headless agent CLI (`runAgent`) and the iterative (MCP) harness
 * (`iterative`), plus the SF3D engine (`sf3d`). Nothing here imports `electron` or another feature, so the
 * whole half runs under bare vitest — and Studio's desktop and Gamer's main each wire their own.
 *
 * `runAgent`, `iterative` and `sf3d` are optional: an app without agents (Gamer today) leaves them out and the
 * feature answers an agent or SF3D engine request with a plain "not available" instead of guessing.
 */
export type ModelRuntimeDeps = Pick<ModelLibraryDeps, 'rootFor' | 'createGroup' | 'trash' | 'author'> & {
  writeBytes: (req: Scope & { path: string; data: Buffer }) => Promise<GitOpResult<unknown>>;
  readBytes: (req: Scope & { path: string }) => Promise<GitOpResult<Buffer>>;
  onChanged: (repoId: string) => void;
  emit: (event: ModelGenerateProgressEvent) => void;
  ollama: OllamaSeam;
  runAgent?: EngineDeps['runAgent'];
  iterative?: ModelServiceDeps['iterative'];
  sf3d?: ModelServiceDeps['sf3d'];
};

export type ModelRuntime = {
  service: ReturnType<typeof createModelService>;
  library: ReturnType<typeof createModelLibrary>;
  sculptStore: ReturnType<typeof createSculptStore>;
  ollama: OllamaSeam;
  /** What the engine picker shows: whether Ollama answers, and what is installed. */
  providers: () => ReturnType<typeof probeProviders>;
  /** The two LLM seams (spec writer, vision) other features' composers reuse — Sprites' `llmCall`/`visionCall`. */
  engines: EngineDeps;
};

const NO_AGENT = async (): Promise<GitOpResult<{ text: string }>> => ({
  ok: false,
  kind: 'error',
  message: 'Agent engines are not available in this app — pick Ollama.',
});

export function createModelRuntime(deps: ModelRuntimeDeps): ModelRuntime {
  const engines: EngineDeps = { ollama: deps.ollama, runAgent: deps.runAgent ?? NO_AGENT };
  const sculptStore = createSculptStore({ readBytes: deps.readBytes, writeBytes: deps.writeBytes });
  const service = createModelService({
    llm: createLlmCall(engines),
    describeImage: createDescribeImage(engines),
    author: deps.author,
    writeBytes: deps.writeBytes,
    readBytes: deps.readBytes,
    emit: deps.emit,
    ...(deps.iterative ? { iterative: deps.iterative } : {}),
    ...(deps.sf3d ? { sf3d: deps.sf3d } : {}),
  });
  const library = createModelLibrary({
    rootFor: deps.rootFor,
    createGroup: deps.createGroup,
    trash: deps.trash,
    onChanged: deps.onChanged,
    author: deps.author,
  });
  return { service, library, sculptStore, ollama: deps.ollama, providers: () => probeProviders(deps.ollama), engines };
}
