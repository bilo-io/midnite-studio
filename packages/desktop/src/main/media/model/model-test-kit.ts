import { failure, ok, type ModelChangedEvent, type ModelOpenEvent } from '@midnite/studio-shared';

import { createSculptStore } from './sculpt-store';
import { createModelService, type ModelServiceDeps } from './model-service';
import { createModelTools, type ModelMcpDeps, type ModelTools } from './model-mcp';

/**
 * Test-only: the model service and the `model_*` tools wired over one in-memory
 * file map, the way `ipc/media-model-handlers.ts` wires them over the media
 * store — so a test exercises the real tool code paths with no disk, no
 * Electron and no CLI.
 */
export type MemoryModelKit = {
  files: Map<string, Buffer>;
  changed: ModelChangedEvent[];
  opened: ModelOpenEvent[];
  tools: ModelTools;
  service: ReturnType<typeof createModelService>;
  /** The path the in-memory repo answers to. */
  repoPath: string;
};

const keyOf = (project: string, path: string): string => `${project}/${path}`;

export function memoryModelKit(overrides: { service?: Partial<ModelServiceDeps>; tools?: Partial<ModelMcpDeps> } = {}): MemoryModelKit {
  const files = new Map<string, Buffer>();
  const changed: ModelChangedEvent[] = [];
  const opened: ModelOpenEvent[] = [];
  const repoPath = '/work/repo';
  const repoId = 'r1';
  const now = () => new Date(2026, 9, 3, 14, 15, 2);

  const service = createModelService({
    llm: async () => failure('no llm in this kit'),
    describeImage: async () => failure('no vision in this kit'),
    writeBytes: async ({ project, path, data }) => {
      files.set(keyOf(project, path), data);
      return ok({ size: data.length });
    },
    readBytes: async ({ project, path }) => {
      const found = files.get(keyOf(project, path));
      return found ? ok(found) : failure('File not found.');
    },
    emit: () => undefined,
    now,
    ...overrides.service,
  });

  const sculpt = createSculptStore({
    readBytes: async ({ project, path }) => {
      const found = files.get(keyOf(project, path));
      return found ? ok(found) : failure('File not found.');
    },
    writeBytes: async ({ project, path, data }) => {
      files.set(keyOf(project, path), data);
      return ok({ size: data.length });
    },
  });

  const tools = createModelTools({
    resolveRepo: async (path) =>
      path.startsWith(repoPath) ? { ok: true, repoId } : { ok: false, kind: 'refused', message: `"${path}" is not a repository Midnite Studio has open.` },
    listProjects: async () => {
      const names = [...new Set([...files.keys()].map((k) => k.split('/')[0]!))];
      return ok(names.map((name) => ({ name, fileCount: 0, mtimeMs: 0 })));
    },
    listFiles: async ({ project }) =>
      ok(
        [...files.keys()]
          .filter((k) => k.startsWith(`${project}/`))
          .map((k) => ({ path: k.slice(project.length + 1), mtimeMs: 1 })),
      ),
    readBytes: async ({ project, path }) => {
      const found = files.get(keyOf(project, path));
      return found ? ok(found) : failure('File not found.');
    },
    saveSpec: (req) => service.saveEdit(req),
    writeSidecar: (req) => service.writeSidecar(req),
    writeMesh: (req) => sculpt.handle(req),
    writeFile: async ({ project, path, data }) => {
      files.set(keyOf(project, path), data);
      return ok({ size: data.length });
    },
    exportModel: (req) => service.exportModel(req),
    createModel: (req) => service.createModel(req),
    emitChanged: (event) => changed.push(event),
    emitOpen: (event) => opened.push(event),
    now,
    ...overrides.tools,
  });

  return { files, changed, opened, tools, service, repoPath };
}

/** A small valid design: a red box on the ground. */
export const BOX_SPEC = {
  name: 'crate',
  parts: [{ name: 'crate', shape: 'box', size: [1, 1, 1], position: [0, 0.5, 0], color: '#cc3333' }],
};
