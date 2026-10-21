import {
  missingModelAssets,
  missingModelMaps,
  modelTexture,
  registerModelTexture,
  missingSculptMeshes,
  modelAsset,
  modelAssetEpoch,
  modelAssetHash,
  modelAssetPath,
  type ModelSpec,
  parseGlbMesh,
  registerModelAsset,
  registerSculptMesh,
  subscribeModelAssets,
} from '@midnite/studio-shared';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { NoColorSpace, SRGBColorSpace, Texture } from 'three';

import { modelFileUrl } from './model-utils';

/**
 * The editor's side of imported meshes (`asset` parts, Phase 103 Theme J, and `sculpt` parts' `.mesh.bin`, Phase 104): fetch each `.glb` a design
 * names from its folder (`mstudio-file://`), check it against the part's hash, parse it and register it
 * with the kernel, which then builds it like any other part. `useModelAssetEpoch` re-renders whoever
 * builds the scene once a mesh lands, and `assetTexture` turns a registered image into a three texture.
 */

/** Hashes already asked for, so a missing file is fetched once rather than on every render. */
const requested = new Set<string>();

export async function loadAsset(url: string, hash: string, kind: 'asset' | 'sculpt' = 'asset'): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return `HTTP ${response.status}`;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (modelAssetHash(bytes) !== hash) return kind === 'sculpt' ? 'the file changed since the design was saved' : 'the file changed since it was imported';
    if (kind === 'sculpt') registerSculptMesh(hash, bytes);
    else registerModelAsset(hash, parseGlbMesh(bytes));
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Fetches a map PNG, checks its hash and registers it; answers the problem, or `null`. */
async function loadMap(url: string, hash: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return `HTTP ${response.status}`;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (modelAssetHash(bytes) !== hash) return 'the file changed since the design was saved';
    registerModelTexture(hash, { mime: 'image/png', data: bytes });
    bumpMaps();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

let mapEpoch = 0;
const mapListeners = new Set<() => void>();
const bumpMaps = (): void => {
  mapEpoch += 1;
  for (const listener of mapListeners) listener();
};
const subscribeMaps = (listener: () => void): (() => void) => {
  mapListeners.add(listener);
  return () => void mapListeners.delete(listener);
};
/** Changes whenever a map texture is registered — a dependency for anything that draws them. */
export const useModelMapEpoch = (): number => useSyncExternalStore(subscribeMaps, () => mapEpoch, () => mapEpoch);

const mapTextures = new Map<string, Texture>();

/**
 * A registered map (a bake, or a flattened PBR texture) as a three texture, decoded once per hash. Colour maps are
 * sRGB; normal, ORM and occlusion are data and stay linear. `null` until the file is registered.
 */
export function mapTexture(hash: string, srgb: boolean, onReady?: () => void): Texture | null {
  const key = `${hash}:${srgb ? 's' : 'l'}`;
  const hit = mapTextures.get(key);
  if (hit) return hit;
  const image = modelTexture(hash);
  if (!image || typeof createImageBitmap !== 'function') return null;
  const texture = new Texture();
  texture.flipY = false;
  texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  mapTextures.set(key, texture);
  void createImageBitmap(new Blob([image.data as BlobPart], { type: image.mime }), { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
    .then((bitmap) => {
      texture.image = bitmap;
      texture.needsUpdate = true;
      onReady?.();
    })
    .catch(() => mapTextures.delete(key));
  return texture;
}

/** Loads the imported meshes of `spec` (its folder is `dir` inside `project`); answers the problems seen. */
export function useModelAssets(repoId: string, project: string | null, dir: string, spec: Pick<ModelSpec, 'parts'> | null): string[] {
  const [problems, setProblems] = useState<string[]>([]);
  useEffect(() => {
    if (!project || !spec) return;
    const missing = [...missingModelAssets(spec), ...missingSculptMeshes(spec)].filter((part) => !requested.has(part.hash));
    // Baked maps (Theme F) and a painted part's flattened PBR set (Theme G): registered by hash, drawn by `mapTexture`.
    const maps = missingModelMaps(spec).filter((file) => !requested.has(file.hash));
    let live = true;
    for (const file of maps) {
      requested.add(file.hash);
      void loadMap(modelFileUrl(repoId, project, modelAssetPath(dir, file.src)), file.hash).then((problem) => {
        if (problem === null) return;
        requested.delete(file.hash);
        if (live) setProblems((list) => [...list, `${file.src}: ${problem}`]);
      });
    }
    const stop = () => {
      live = false;
    };
    if (missing.length === 0) return stop;
    for (const part of missing) {
      requested.add(part.hash);
      void loadAsset(modelFileUrl(repoId, project, modelAssetPath(dir, part.src)), part.hash, part.shape).then((problem) => {
        if (problem === null) return;
        requested.delete(part.hash);
        if (live) setProblems((list) => [...list, `${part.src}: ${problem}`]);
      });
    }
    return stop;
  }, [repoId, project, dir, spec]);
  return problems;
}

/** Changes whenever a mesh is registered — a dependency for anything that builds the scene. */
export const useModelAssetEpoch = (): number => useSyncExternalStore(subscribeModelAssets, modelAssetEpoch, modelAssetEpoch);

const textures = new Map<string, Texture>();

/**
 * The texture of a registered asset, decoded once per hash. The image arrives asynchronously, so the
 * texture is returned at once and fills in; `onReady` lets the caller ask for a redraw.
 */
export function assetTexture(hash: string, onReady?: () => void): Texture | null {
  const hit = textures.get(hash);
  if (hit) return hit;
  const image = modelAsset(hash)?.texture;
  if (!image || typeof createImageBitmap !== 'function') return null;
  const texture = new Texture();
  // glTF's uv origin is the image's top-left: no flip, as three's GLTFLoader does.
  texture.flipY = false;
  texture.colorSpace = SRGBColorSpace;
  textures.set(hash, texture);
  void createImageBitmap(new Blob([image.data as BlobPart], { type: image.mime }), { imageOrientation: 'none' })
    .then((bitmap) => {
      texture.image = bitmap;
      texture.needsUpdate = true;
      onReady?.();
    })
    .catch(() => textures.delete(hash));
  return texture;
}
