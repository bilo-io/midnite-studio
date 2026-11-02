import {
  ANIMATION_MAX_FILE_BYTES,
  failure,
  ok,
  type AnimationChangedEvent,
  type AnimationImportResult,
  type AnimationProgressEvent,
  type AnimationRequest,
  type GitOpResult,
} from '@midnite/studio-shared';

import type { AnimationLibrary } from './animation-library';
import { createAnimationImporter } from './import-service';

/**
 * The one dispatcher behind the `mediaAnimation` channel (Phase 125 Theme A): `list`, the three imports,
 * `update`, `remove` and `read`, each answering the `GitOpResult` envelope — it never throws across IPC.
 *
 * The two native dialogs arrive as `pickPaths`, so nothing here imports `electron`: the composer binds it to
 * `dialog.showOpenDialog` (files, or a folder) and a test passes a stub.
 */

export type AnimationServiceDeps = {
  library: AnimationLibrary;
  /** The native picker: absolute paths, or null when the user dismisses it. */
  pickPaths: (kind: 'files' | 'folder') => Promise<string[] | null>;
  emitChanged: (event: AnimationChangedEvent) => void;
  emitProgress: (event: AnimationProgressEvent) => void;
};

export type AnimationService = {
  handle: (req: AnimationRequest) => Promise<GitOpResult<unknown> | GitOpResult>;
};

const caught = (error: unknown) => failure(error instanceof Error ? error.message : String(error));

/** What a service answers when its host has no library (a host that does not carry the tab). */
export function unavailableAnimations(host: string): AnimationService {
  return { handle: async () => failure(`The animation library is not available in ${host}.`) };
}

export function createAnimationService(deps: AnimationServiceDeps): AnimationService {
  const { library, pickPaths, emitChanged, emitProgress } = deps;
  const importer = createAnimationImporter({ library, onProgress: emitProgress });

  const finish = (result: AnimationImportResult): GitOpResult<AnimationImportResult> => {
    // A duplicate can still have merged tags into the clip, so any non-empty outcome refreshes the list.
    if (result.added.length > 0 || result.duplicates.length > 0) emitChanged({ reason: 'import', count: result.added.length });
    return ok(result);
  };
  const cancelled = (): GitOpResult<AnimationImportResult> => ok({ added: [], duplicates: [], failed: [], warnings: [], cancelled: true });

  return {
    async handle(req) {
      try {
        switch (req.op) {
          case 'list':
            return ok({ clips: await library.list() });
          case 'importFiles':
          case 'importFolder': {
            const picked = await pickPaths(req.op === 'importFiles' ? 'files' : 'folder');
            if (!picked || picked.length === 0) return cancelled();
            return finish(await importer.importPaths(picked));
          }
          case 'importBytes': {
            // Base64 is 4 bytes for every 3, so the encoded length bounds the decoded size before allocating it.
            if (req.dataBase64.length > Math.ceil((ANIMATION_MAX_FILE_BYTES * 4) / 3) + 4) return failure('The file is too large to import by drop');
            const bytes = Buffer.from(req.dataBase64, 'base64');
            return finish(await importer.importBytes({ name: req.name, bytes, folder: req.folder }));
          }
          case 'update': {
            const clip = await library.update(req.id, req.patch);
            if (!clip) return failure('That clip is no longer in the library');
            emitChanged({ reason: 'update', count: 1 });
            return ok({ clip });
          }
          case 'remove': {
            const removed = await library.remove(req.id);
            if (!removed) return failure('That clip is no longer in the library');
            emitChanged({ reason: 'remove', count: 1 });
            return ok(undefined);
          }
          case 'read': {
            const read = await library.read(req.id);
            if (!read) return failure('That clip is no longer in the library');
            if (read.bytes.byteLength > ANIMATION_MAX_FILE_BYTES) return failure('The clip is too large to preview');
            return ok({ id: read.clip.id, name: read.clip.name, format: read.clip.format, dataBase64: Buffer.from(read.bytes).toString('base64') });
          }
        }
      } catch (error) {
        return caught(error);
      }
    },
  };
}
