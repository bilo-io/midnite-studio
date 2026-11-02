import { lstat, readdir, readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

import {
  ANIMATION_EXTENSIONS,
  ANIMATION_MAX_FILE_BYTES,
  type AnimationFormat,
  type AnimationImportFailure,
  type AnimationImportResult,
  type AnimationProgressEvent,
} from '@midnite/studio-shared';

import type { AnimationLibrary } from './animation-library';
import { autoTags } from './auto-tags';
import { ClipParseError, type ClipMeta } from './clip-meta';
import { clipNameFromFile, detectMixamo } from './mixamo';
import { parseBvh } from './parse-bvh';
import { parseFbx } from './parse-fbx';
import { parseGltf } from './parse-gltf';

/**
 * Bulk import for the animation library (Phase 125 Theme B): files and folders in, parsed, named, tagged and
 * added. One bad file never aborts the batch — it lands in `failed` with a reason and the rest carry on.
 *
 * A folder is walked to depth {@link MAX_DEPTH}, picking up `.fbx .glb .gltf .bvh` only; symlinks and dotfiles
 * are not followed (a folder import must never wander out of the folder the user chose), and a walk stops at
 * {@link MAX_FILES} files so a pointed-at home directory cannot run away.
 */

export const MAX_DEPTH = 4;
export const MAX_FILES = 2000;

const FORMAT_BY_EXT: Record<string, AnimationFormat> = { '.fbx': 'fbx', '.glb': 'glb', '.gltf': 'gltf', '.bvh': 'bvh' };

export type ImporterDeps = {
  library: AnimationLibrary;
  onProgress?: (event: AnimationProgressEvent) => void;
};

export type AnimationImporter = {
  importPaths: (paths: readonly string[]) => Promise<AnimationImportResult>;
  importBytes: (input: { name: string; bytes: Uint8Array; folder?: string }) => Promise<AnimationImportResult>;
};

function parseClip(format: AnimationFormat, bytes: Uint8Array): ClipMeta {
  switch (format) {
    case 'fbx':
      return parseFbx(bytes);
    case 'glb':
    case 'gltf':
      return parseGltf(bytes);
    case 'bvh':
      return parseBvh(bytes);
  }
}

type Walked = { files: { path: string; folder: string }[]; truncated: boolean };

/** Every clip file under `paths`: a file is itself, a folder is walked. Sorted, so a re-run reads in one order. */
export async function collectClipFiles(paths: readonly string[]): Promise<Walked> {
  const files: Walked['files'] = [];
  let truncated = false;
  const visit = async (path: string, depth: number, folder: string): Promise<void> => {
    if (files.length >= MAX_FILES) {
      truncated = true;
      return;
    }
    const info = await lstat(path).catch(() => null);
    if (!info || info.isSymbolicLink()) return;
    if (info.isFile()) {
      if (ANIMATION_EXTENSIONS.includes(extname(path).toLowerCase())) files.push({ path, folder });
      return;
    }
    if (!info.isDirectory() || depth > MAX_DEPTH) return;
    const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      await visit(join(path, entry.name), depth + 1, entry.isDirectory() ? entry.name : folder);
    }
  };
  for (const path of paths) {
    const info = await lstat(path).catch(() => null);
    await visit(path, 0, info?.isDirectory() ? basename(path) : '');
  }
  return { files, truncated };
}

export function createAnimationImporter(deps: ImporterDeps): AnimationImporter {
  const { library, onProgress } = deps;

  async function importOne(name: string, bytes: Uint8Array, folder: string, result: AnimationImportResult): Promise<void> {
    const format = FORMAT_BY_EXT[extname(name).toLowerCase()];
    if (!format) {
      result.failed.push({ name, reason: 'Not an animation file (.fbx, .glb, .gltf or .bvh)' });
      return;
    }
    if (bytes.byteLength === 0) {
      result.failed.push({ name, reason: 'The file is empty' });
      return;
    }
    if (bytes.byteLength > ANIMATION_MAX_FILE_BYTES) {
      result.failed.push({ name, reason: `The file is larger than ${ANIMATION_MAX_FILE_BYTES / (1024 * 1024)} MB` });
      return;
    }
    let meta: ClipMeta;
    try {
      meta = parseClip(format, bytes);
    } catch (error) {
      result.failed.push({ name, reason: error instanceof ClipParseError ? error.message : 'The file could not be read' });
      return;
    }
    for (const warning of meta.warnings) result.warnings.push(`${name}: ${warning}`);
    const mixamo = detectMixamo(meta.boneNames);
    const clipName = clipNameFromFile(name, meta.takeName, folder);
    const added = await library.add({
      bytes,
      format,
      name: clipName,
      tags: autoTags(clipName, folder),
      durationSec: meta.durationSec,
      frameCount: meta.frameCount,
      fps: meta.fps,
      boneCount: meta.boneNames.length > 0 ? meta.boneNames.length : undefined,
      hasSkin: meta.hasSkin,
      source: mixamo ? 'mixamo' : 'local',
      site: mixamo ? 'mixamo.com' : undefined,
      licence: mixamo ? 'mixamo-eula' : 'unknown',
      author: mixamo ? 'Mixamo' : '',
    });
    (added.duplicate ? result.duplicates : result.added).push(added.clip);
  }

  const empty = (): AnimationImportResult => ({ added: [], duplicates: [], failed: [], warnings: [], cancelled: false });

  return {
    async importPaths(paths) {
      const result = empty();
      const { files, truncated } = await collectClipFiles(paths);
      if (truncated) result.warnings.push(`Only the first ${MAX_FILES} files were imported.`);
      if (files.length === 0) {
        result.failed.push({ name: paths.map((p) => basename(p)).join(', ') || 'selection', reason: 'No .fbx, .glb, .gltf or .bvh files found' });
        return result;
      }
      let done = 0;
      for (const { path, folder } of files) {
        const name = basename(path);
        onProgress?.({ done, total: files.length, current: name, finished: false });
        try {
          const info = await lstat(path);
          if (info.size > ANIMATION_MAX_FILE_BYTES) {
            const failure: AnimationImportFailure = { name, reason: `The file is larger than ${ANIMATION_MAX_FILE_BYTES / (1024 * 1024)} MB` };
            result.failed.push(failure);
          } else {
            await importOne(name, await readFile(path), folder, result);
          }
        } catch (error) {
          result.failed.push({ name, reason: error instanceof Error ? error.message : 'The file could not be read' });
        }
        done += 1;
      }
      onProgress?.({ done, total: files.length, finished: true });
      return result;
    },

    async importBytes({ name, bytes, folder }) {
      const result = empty();
      onProgress?.({ done: 0, total: 1, current: name, finished: false });
      try {
        await importOne(basename(name), bytes, folder ? basename(folder) : '', result);
      } catch (error) {
        result.failed.push({ name, reason: error instanceof Error ? error.message : 'The file could not be read' });
      }
      onProgress?.({ done: 1, total: 1, finished: true });
      return result;
    },
  };
}
