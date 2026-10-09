import { MODEL_CLIP_KINDS, type ModelClip, type ModelLibraryNode } from '@midnite/studio-shared';

import { collectModels, joinLibraryPath, splitProjectPath } from '../model/library-tree';

/**
 * Phase 106 Theme E: the Models assets a sheet can be rendered from — those whose `model.json`
 * summary says they have a rig **and** animations. The design path is what `reference.path` stores;
 * the clips come from the summary (name, kind, effective duration), which is enough to show the
 * clip mapping before anything is rendered.
 */
export type RiggedModel = { project: string; path: string; label: string; clips: ModelClip[] };

const isKind = (value: unknown): value is ModelClip['kind'] => (MODEL_CLIP_KINDS as readonly unknown[]).includes(value);

export function riggedModels(tree: readonly ModelLibraryNode[]): RiggedModel[] {
  const out: RiggedModel[] = [];
  for (const model of tree.flatMap((node) => collectModels(node))) {
    const manifest = model.manifest;
    const design = manifest?.files.design;
    if (!manifest || !design || !manifest.rig || !Array.isArray(manifest.animations)) continue;
    const clips: ModelClip[] = [];
    for (const raw of manifest.animations as unknown[]) {
      const c = raw as { name?: unknown; kind?: unknown; duration?: unknown; loop?: unknown };
      if (typeof c.name !== 'string' || !isKind(c.kind)) continue;
      clips.push({ name: c.name, kind: c.kind, ...(typeof c.duration === 'number' && c.duration >= 0.1 ? { duration: c.duration } : {}), ...(typeof c.loop === 'boolean' ? { loop: c.loop } : {}) });
    }
    if (clips.length === 0) continue;
    const { project, rest } = splitProjectPath(model.path);
    const dir = model.legacy ? rest.split('/').slice(0, -1).join('/') : rest;
    out.push({ project, path: joinLibraryPath(dir, design), label: manifest.name, clips });
  }
  return out;
}
