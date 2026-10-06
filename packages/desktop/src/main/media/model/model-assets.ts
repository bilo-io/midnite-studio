import {
  type GitOpResult,
  missingModelAssets,
  missingSculptMeshes,
  modelAssetHash,
  modelAssetPath,
  type ModelSpec,
  parseGlbMesh,
  registerModelAsset,
  registerSculptMesh,
} from '@midnite/studio-shared';

/**
 * Loads the files behind a design's `asset` and `sculpt` parts into the kernel's registry, so `buildScene` can draw
 * them. Main calls it wherever it builds a design read from disk — before an export, a save, a manifest
 * or any `model_*` tool — with `dir`, the design's folder inside the media project (`''` for a flat
 * legacy model). Already-registered meshes cost nothing; a missing, changed or unreadable file is
 * reported, and the build then says the part is not loaded rather than failing.
 */
export type AssetScope = { repoId: string; tab: 'model'; project: string };
export type ReadAssetBytes = (req: AssetScope & { path: string }) => Promise<GitOpResult<Buffer>>;

export const asBytes = (buffer: Buffer): Uint8Array => new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

/** The design's folder for a path of one of its files (`fox/fox.obj` → `fox`, `fox.obj` → `''`). */
export const designDir = (path: string): string => path.split('/').slice(0, -1).join('/');

export async function loadModelAssets(readBytes: ReadAssetBytes, scope: AssetScope, dir: string, spec: Pick<ModelSpec, 'parts'>): Promise<string[]> {
  const problems: string[] = [];
  for (const part of missingModelAssets(spec)) {
    const read = await readBytes({ ...scope, path: modelAssetPath(dir, part.src) });
    if (!read.ok) {
      problems.push(`The imported mesh "${part.src}" is missing from the model's folder.`);
      continue;
    }
    const bytes = asBytes(read.value);
    const hash = modelAssetHash(bytes);
    if (hash !== part.hash) {
      problems.push(`The imported mesh "${part.src}" has changed since it was imported (hash ${hash}, the design expects ${part.hash}).`);
      continue;
    }
    try {
      registerModelAsset(hash, parseGlbMesh(bytes));
    } catch (error) {
      problems.push(`The imported mesh "${part.src}" could not be read: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // Sculpt meshes (Phase 104): the same registry, a `.mesh.bin` instead of a `.glb`.
  for (const part of missingSculptMeshes(spec)) {
    const read = await readBytes({ ...scope, path: modelAssetPath(dir, part.src) });
    if (!read.ok) {
      problems.push(`The sculpt mesh "${part.src}" is missing from the model's folder.`);
      continue;
    }
    const bytes = asBytes(read.value);
    const hash = modelAssetHash(bytes);
    if (hash !== part.hash) {
      problems.push(`The sculpt mesh "${part.src}" has changed since the design was saved (hash ${hash}, the design expects ${part.hash}).`);
      continue;
    }
    try {
      registerSculptMesh(hash, bytes);
    } catch (error) {
      problems.push(`The sculpt mesh "${part.src}" could not be read: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return problems;
}
