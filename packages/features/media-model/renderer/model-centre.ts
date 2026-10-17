import { libraryBase, libraryParent, type ModelLibraryModel, type ModelLibraryNode } from '@midnite/studio-shared';

import {
  designFile,
  fileExt,
  findNode,
  is3dFile,
  isImageFile,
  joinLibraryPath,
  modelFilePath,
  splitProjectPath,
  type ModelSelection,
} from './library-tree';
import type { ModelViewFormat } from './model-utils';

/**
 * What the centre pane shows for the explorer's selection:
 *
 * - a model folder, or its design (`<stem>.json`) → the 3D **editor** (a folder with no design opens its
 *   3D file in the viewer, and one with only a `model.json` shows that);
 * - `model.json` and any other `.json` → the pretty-printed **JSON** viewer;
 * - `.obj` / `.fbx` / `.glb` → the read-only 3D **viewer**;
 * - a reference picture → the **image**.
 *
 * `project` is the top-level group (the media store's project); `path` is inside it.
 */
export type Centre =
  | { kind: 'empty' }
  | { kind: 'editor'; project: string; path: string }
  | { kind: 'viewer'; project: string; path: string; format: ModelViewFormat }
  | { kind: 'json'; project: string; path: string }
  | { kind: 'image'; project: string; path: string }
  | { kind: 'unsupported'; project: string; path: string };

export function resolveCentre(selection: ModelSelection | null, tree: readonly ModelLibraryNode[]): Centre {
  if (!selection) return { kind: 'empty' };
  if (selection.kind === 'group') return { kind: 'empty' };

  if (selection.kind === 'model') {
    const node = findNode(tree, selection.path);
    if (!node || node.kind !== 'model') return { kind: 'empty' };
    return centreForModel(node);
  }

  // A file: `<model path>/<name>` (a legacy model's files sit in its group).
  const name = libraryBase(selection.path);
  const { project, rest } = splitProjectPath(selection.path);
  if (rest === '') return { kind: 'empty' };
  const ext = fileExt(name);
  if (ext === 'json') {
    if (name === 'model.json') return { kind: 'json', project, path: rest };
    // The design is the `.json` beside a 3D file of the same stem.
    const stemPath = selection.path.replace(/\.[^./]+$/, '');
    const parent = findNode(tree, libraryParent(selection.path));
    const owner = parent?.kind === 'model' ? parent : findNode(tree, stemPath);
    if (owner?.kind === 'model') {
      const target = modelFilePath(owner);
      if (target && designFile(owner) === name) return { kind: 'editor', project: target.project, path: target.path };
    }
    return { kind: 'json', project, path: rest };
  }
  if (is3dFile(name)) return { kind: 'viewer', project, path: rest, format: ext as ModelViewFormat };
  if (isImageFile(name)) return { kind: 'image', project, path: rest };
  return { kind: 'unsupported', project, path: rest };
}

function centreForModel(model: ModelLibraryModel): Centre {
  const target = modelFilePath(model);
  if (target && designFile(model)) return { kind: 'editor', project: target.project, path: target.path };
  if (target) return { kind: 'viewer', project: target.project, path: target.path, format: fileExt(target.path) as ModelViewFormat };
  if (model.manifest) {
    const { project, rest } = splitProjectPath(joinLibraryPath(model.path, 'model.json'));
    return { kind: 'json', project, path: rest };
  }
  return { kind: 'empty' };
}

/**
 * The explorer selection that shows `primary` (a path inside `project`, as a generation reports it): a
 * file in a folder selects the folder, a flat legacy file selects itself.
 */
export function selectionForGenerated(project: string, primary: string): ModelSelection {
  const dir = libraryParent(primary);
  return dir ? { kind: 'model', path: joinLibraryPath(project, dir) } : { kind: 'file', path: joinLibraryPath(project, primary) };
}
