import {
  isWithinLibraryPath,
  libraryBase,
  libraryParent,
  type ModelLibraryGroup,
  type ModelLibraryModel,
  type ModelLibraryNode,
} from '@midnite/studio-shared';

/**
 * Pure helpers over the library tree main hands the explorer (`mstudio:media:model-library`).
 * Paths are relative to `.midnite/media/model/`: `<group>[/<group>…]/<model-folder>[/<file>]`, and the
 * first segment is the media store's "project".
 */

/** What is highlighted in the explorer. A file's `path` is `<model path>/<file name>`. */
export type ModelSelection = { kind: 'model' | 'group' | 'file'; path: string };

/** The media store's `project` (the top-level group) and the path inside it. */
export const splitProjectPath = (path: string): { project: string; rest: string } => {
  const index = path.indexOf('/');
  return index < 0 ? { project: path, rest: '' } : { project: path.slice(0, index), rest: path.slice(index + 1) };
};

export const joinLibraryPath = (...segments: string[]): string => segments.filter((s) => s !== '').join('/');

export function findNode(tree: readonly ModelLibraryNode[], path: string): ModelLibraryNode | null {
  for (const node of tree) {
    if (node.path === path) return node;
    if (node.kind === 'group' && isWithinLibraryPath(node.path, path)) {
      const inner = findNode(node.children, path);
      if (inner) return inner;
    }
  }
  return null;
}

export function collectModels(node: ModelLibraryNode): ModelLibraryModel[] {
  return node.kind === 'model' ? [node] : node.children.flatMap(collectModels);
}

export const countModels = (tree: readonly ModelLibraryNode[]): number => tree.reduce((sum, node) => sum + collectModels(node).length, 0);

export const countFiles = (node: ModelLibraryNode): number => collectModels(node).reduce((sum, m) => sum + m.files.length, 0);

export function collectGroups(tree: readonly ModelLibraryNode[]): ModelLibraryGroup[] {
  return tree.flatMap((node) => (node.kind === 'group' ? [node, ...collectGroups(node.children)] : []));
}

/** Files a model row lists. The `.mtl` is plumbing for the `.obj`, so it stays out of the way. */
export const visibleFiles = (model: ModelLibraryModel) => model.files.filter((f) => !f.name.endsWith('.mtl'));

const THREE_D = ['obj', 'fbx', 'glb'] as const;
export const fileExt = (name: string): string => (name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : '');
export const is3dFile = (name: string): boolean => (THREE_D as readonly string[]).includes(fileExt(name));
export const isImageFile = (name: string): boolean => ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(fileExt(name));

/** The 3D file a model opens as: the manifest's `.obj`, else any `.obj`, `.glb`, `.fbx`. */
export function primaryFile(model: ModelLibraryModel): string | null {
  const names = model.files.map((f) => f.name);
  const declared = model.manifest?.files.obj;
  if (declared && names.includes(declared)) return declared;
  for (const ext of THREE_D) {
    // Not the reference picture, and not an imported mesh — the design's own exports are what opens.
    const found = names.find((n) => fileExt(n) === ext && !n.includes('.ref.') && !n.endsWith('.asset.glb'));
    if (found) return found;
  }
  return null;
}

/** The editable design beside a model's exports — `<stem>.json`, never `model.json`. */
export function designFile(model: ModelLibraryModel): string | null {
  const names = model.files.map((f) => f.name);
  const declared = model.manifest?.files.design;
  if (declared && names.includes(declared)) return declared;
  const primary = primaryFile(model);
  const sibling = primary ? primary.replace(/\.[^./]+$/, '.json') : null;
  return sibling && names.includes(sibling) ? sibling : null;
}

/** A model's primary file as a path inside its top-level group (the media store's `project`). */
export function modelFilePath(model: ModelLibraryModel): { project: string; path: string } | null {
  const file = primaryFile(model);
  if (!file) return null;
  const { project, rest } = splitProjectPath(model.path);
  // A legacy model's files sit in its group, not in a folder named after it.
  const dir = model.legacy ? libraryParent(rest) : rest;
  return { project, path: joinLibraryPath(dir, file) };
}

export type DropCheck = { ok: true } | { ok: false; reason: string };

/**
 * Whether `dragged` may be dropped on the group `target` (`''` = the root). Models need a group to live
 * in; a group cannot enter itself or its descendants; dropping where it already is does nothing.
 */
export function canDrop(
  dragged: { path: string; kind: 'model' | 'group' },
  target: { path: string; kind: 'group' | 'root' },
): DropCheck {
  if (libraryParent(dragged.path) === target.path) return { ok: false, reason: 'Already here.' };
  if (target.kind === 'root' && dragged.kind === 'model') return { ok: false, reason: 'Models live inside a group.' };
  if (isWithinLibraryPath(dragged.path, target.path)) return { ok: false, reason: 'A folder cannot move into itself.' };
  return { ok: true };
}

/** `claude` → `Claude`; `ollama` → `Ollama`; ids the roster does not know keep their own spelling. */
export const providerLabel = (provider: string): string => {
  const known: Record<string, string> = { claude: 'Claude', codex: 'Codex', antigravity: 'Antigravity', gemini: 'Gemini', ollama: 'Ollama', mcp: 'an MCP session' };
  return known[provider] ?? provider;
};

/** The tooltip on a folder's provider icon: the specific model, not just the family. */
export function agentTooltip(model: ModelLibraryModel): string {
  const agent = model.manifest?.agent;
  if (!agent) return 'No model.json — generator unknown';
  const label = providerLabel(agent.provider);
  return agent.model ? `${label} · ${agent.model}${agent.iterative ? ' (iterative)' : ''}` : `${label}${agent.iterative ? ' (iterative)' : ''}`;
}

export const nameOf = libraryBase;
